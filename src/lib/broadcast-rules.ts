import {
  MIN_CONFIDENCE,
  SETTLEMENT_EMERGENCY_KM,
  downwindOf,
} from "@/lib/alerts-rules";
import { bearingBetween } from "@/lib/nadhir";

export const BROADCAST_RING_KM = 15;
export const BROADCAST_END_AFTER_HOURS = 12;
export const BROADCAST_DAILY_COMMUNE_LIMIT = 6;

const HOUR = 3600_000;

export type CommuneShape = {
  code: string;
  lat: number;
  lon: number;
  geom: { type: string; coordinates: unknown } | null;
};

type Ring = [number, number][];

function polygonsOf(geom: CommuneShape["geom"]): Ring[][] {
  if (!geom) return [];
  if (geom.type === "Polygon") return [geom.coordinates as Ring[]];
  if (geom.type === "MultiPolygon") return geom.coordinates as Ring[][];
  return [];
}

function pointInRing(lat: number, lon: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    const intersects =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInMultiPolygon(
  lat: number,
  lon: number,
  geom: CommuneShape["geom"],
): boolean {
  for (const rings of polygonsOf(geom)) {
    const [outer, ...holes] = rings;
    if (!outer || !pointInRing(lat, lon, outer)) continue;
    if (!holes.some((h) => pointInRing(lat, lon, h))) return true;
  }
  return false;
}

function kmToSegment(
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
  const px = ax + t * dx - x;
  const py = ay + t * dy - y;
  return Math.sqrt(px * px + py * py);
}

export function kmToMultiPolygon(
  lat: number,
  lon: number,
  geom: CommuneShape["geom"],
): number {
  const polygons = polygonsOf(geom);
  if (!polygons.length) return Infinity;
  if (pointInMultiPolygon(lat, lon, geom)) return 0;

  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  const ky = 110.574;
  let best = Infinity;
  for (const rings of polygons) {
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]!;
        const [xj, yj] = ring[j]!;
        const km = kmToSegment(
          0,
          0,
          (xi - lon) * kx,
          (yi - lat) * ky,
          (xj - lon) * kx,
          (yj - lat) * ky,
        );
        if (km < best) best = km;
      }
    }
  }
  return best;
}

export function targetCommunes(
  fire: { lat: number; lon: number; communeCode: string | null },
  communes: CommuneShape[],
): string[] {
  let containing: string | null = null;
  const ring: { code: string; km: number }[] = [];
  for (const c of communes) {
    if (!containing && pointInMultiPolygon(fire.lat, fire.lon, c.geom)) {
      containing = c.code;
      continue;
    }
    const km = kmToMultiPolygon(fire.lat, fire.lon, c.geom);
    if (km <= BROADCAST_RING_KM) ring.push({ code: c.code, km });
  }
  const head = containing ?? fire.communeCode;
  ring.sort((a, b) => a.km - b.km);
  const codes = ring.map((r) => r.code).filter((code) => code !== head);
  return head ? [head, ...codes] : codes;
}

export function fireSeverity(
  nearestSettlementKm: number | null,
): "Extreme" | "Severe" {
  return nearestSettlementKm !== null &&
    nearestSettlementKm <= SETTLEMENT_EMERGENCY_KM
    ? "Extreme"
    : "Severe";
}

export function downwindAdditions(
  fire: { lat: number; lon: number; spreadBearing: number | null },
  current: string[],
  targets: string[],
  byCode: Map<string, CommuneShape>,
): string[] {
  if (fire.spreadBearing === null) return [];
  const known = new Set(current);
  return targets.filter((code) => {
    if (known.has(code)) return false;
    const commune = byCode.get(code);
    if (!commune) return false;
    return downwindOf(
      fire.spreadBearing,
      bearingBetween(fire.lat, fire.lon, commune.lat, commune.lon),
    );
  });
}

export type FirePlan =
  | { action: "initial"; codes: string[] }
  | { action: "update"; codes: string[]; added: string[] }
  | { action: "end" }
  | { action: "cancel" }
  | null;

export function planFireBroadcast(args: {
  state: string;
  confidence: number;
  lastDetectedMs: number;
  nowMs: number;
  severity: "Extreme" | "Severe";
  open: { phase: string; communeCodes: string[]; severity: string } | null;
  targets: string[];
  additions: string[];
}): FirePlan {
  const open =
    args.open && (args.open.phase === "initial" || args.open.phase === "update")
      ? args.open
      : null;

  if (open) {
    if (args.state === "false_positive") return { action: "cancel" };
    if (args.nowMs - args.lastDetectedMs >= BROADCAST_END_AFTER_HOURS * HOUR)
      return { action: "end" };
    if (args.state !== "active" || args.confidence < MIN_CONFIDENCE)
      return null;
    const escalated = open.severity === "Severe" && args.severity === "Extreme";
    if (args.additions.length || escalated)
      return {
        action: "update",
        codes: [...open.communeCodes, ...args.additions],
        added: args.additions,
      };
    return null;
  }

  if (args.state === "active" && args.confidence >= MIN_CONFIDENCE)
    return { action: "initial", codes: args.targets };
  return null;
}

export function applyDailyLimit(
  codes: string[],
  sentToday: Map<string, number>,
  exempt: boolean,
): { allowed: string[]; dropped: string[] } {
  if (exempt) return { allowed: codes, dropped: [] };
  const allowed: string[] = [];
  const dropped: string[] = [];
  for (const code of codes) {
    if ((sentToday.get(code) ?? 0) >= BROADCAST_DAILY_COMMUNE_LIMIT)
      dropped.push(code);
    else allowed.push(code);
  }
  return { allowed, dropped };
}
