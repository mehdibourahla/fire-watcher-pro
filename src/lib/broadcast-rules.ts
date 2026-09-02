import {
  MIN_CONFIDENCE,
  SETTLEMENT_EMERGENCY_KM,
  downwindOf,
} from "@/lib/alerts-rules";
import { BROADCAST_RING_KM } from "@/lib/cap";
import { bearingBetween } from "@/lib/nadhir";
import { isFuelLimited, type LandcoverFractions } from "@/lib/zonal";

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

export const EXTREME_MIN_FRP_MW = 20;

export function fireSeverity(
  nearestSettlementKm: number | null,
  maxFrpMw: number | null,
): "Extreme" | "Severe" {
  return nearestSettlementKm !== null &&
    nearestSettlementKm <= SETTLEMENT_EMERGENCY_KM &&
    maxFrpMw !== null &&
    maxFrpMw >= EXTREME_MIN_FRP_MW
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

/* A wildfire broadcast for a commune with nothing to burn is a false alarm by
 * construction — the Sahara flares that reach fusion land here. Unknown land
 * cover never masks: absence of data is not evidence of bare ground. */
export function fuelLimitedCodes(
  communes: { code: string; landcover: LandcoverFractions | null }[],
): Set<string> {
  return new Set(
    communes.filter((c) => isFuelLimited(c.landcover)).map((c) => c.code),
  );
}

export const REOPEN_WINDOW_HOURS = 24;

export type OpenThread = {
  phase: string;
  severity: string;
  communeCodes: string[];
  insideCodes: string[];
  atMs: number;
};

export type FirePlan =
  | { action: "initial"; codes: string[]; inside: string[] }
  | { action: "update"; codes: string[]; added: string[]; inside: string[] }
  | { action: "end" }
  | { action: "cancel" }
  | null;

export function planFireBroadcast(args: {
  state: string;
  confidence: number;
  lastDetectedMs: number;
  nowMs: number;
  severity: "Extreme" | "Severe";
  open: OpenThread | null;
  targets: string[];
  additions: string[];
  inside: string[];
  fuelLimited?: Set<string>;
}): FirePlan {
  const burnable = (codes: string[]) =>
    args.fuelLimited ? codes.filter((c) => !args.fuelLimited!.has(c)) : codes;
  const live =
    args.open && (args.open.phase === "initial" || args.open.phase === "update")
      ? args.open
      : null;
  const reopened =
    args.open &&
    args.open.phase === "end" &&
    args.nowMs - args.open.atMs < REOPEN_WINDOW_HOURS * HOUR
      ? args.open
      : null;

  if (live) {
    if (args.state === "false_positive") return { action: "cancel" };
    if (args.nowMs - args.lastDetectedMs >= BROADCAST_END_AFTER_HOURS * HOUR)
      return { action: "end" };
    if (args.state !== "active" || args.confidence < MIN_CONFIDENCE)
      return null;
    const escalated = live.severity === "Severe" && args.severity === "Extreme";
    const additions = burnable(args.additions);
    const codes = [...live.communeCodes, ...additions];
    const insideNew = burnable(args.inside).filter(
      (c) => codes.includes(c) && !live.insideCodes.includes(c),
    );
    if (additions.length || escalated || insideNew.length)
      return {
        action: "update",
        codes,
        added: additions,
        inside: [...live.insideCodes, ...insideNew],
      };
    return null;
  }

  if (args.state === "active" && args.confidence >= MIN_CONFIDENCE) {
    const codes = burnable(args.targets);
    if (!codes.length) return null;
    const fresh = burnable(args.inside).filter((c) => codes.includes(c));
    if (reopened) {
      const kept = reopened.insideCodes.filter((c) => codes.includes(c));
      return {
        action: "update",
        codes,
        added: codes.filter((c) => !reopened.communeCodes.includes(c)),
        inside: [...kept, ...fresh.filter((c) => !kept.includes(c))],
      };
    }
    return { action: "initial", codes, inside: fresh };
  }
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

export function insideCommunes(
  points: { lat: number; lon: number }[],
  codes: string[],
  byCode: Map<string, CommuneShape>,
): string[] {
  return codes.filter((code) => {
    const shape = byCode.get(code);
    return (
      !!shape &&
      points.some((p) => pointInMultiPolygon(p.lat, p.lon, shape.geom))
    );
  });
}

export type Coverage = Map<string, Map<string, 1 | 2>>;

/* Coverage must follow each thread advance within a run, or two clusters
 * sharing a commune both see it uncovered and push it twice. */
export function setThreadCoverage(
  coverage: Coverage,
  clusterId: string,
  thread: OpenThread,
): void {
  for (const byCluster of coverage.values()) byCluster.delete(clusterId);
  if (thread.phase !== "initial" && thread.phase !== "update") return;
  for (const code of thread.communeCodes) {
    const byCluster = coverage.get(code) ?? new Map<string, 1 | 2>();
    byCluster.set(clusterId, thread.insideCodes.includes(code) ? 2 : 1);
    coverage.set(code, byCluster);
  }
}

export function coverageOf(threads: Iterable<[string, OpenThread]>): Coverage {
  const coverage: Coverage = new Map();
  for (const [clusterId, t] of threads)
    setThreadCoverage(coverage, clusterId, t);
  return coverage;
}

function levelElsewhere(
  coverage: Coverage,
  code: string,
  self: string,
): number {
  let best = 0;
  for (const [id, level] of coverage.get(code) ?? [])
    if (id !== self && level > best) best = level;
  return best;
}

/* A push means the commune's alert level rose: a ring-covered commune hears
 * again only when the fire is inside it, and never twice from two clusters. */
export function pushCodesFor(args: {
  clusterId: string;
  action: "initial" | "update" | "end" | "cancel";
  codes: string[];
  inside: string[];
  previous: OpenThread | null;
  coverage: Coverage;
}): string[] {
  if (args.action === "end" || args.action === "cancel")
    return args.codes.filter(
      (code) => levelElsewhere(args.coverage, code, args.clusterId) === 0,
    );
  const mine = (code: string) =>
    args.previous?.insideCodes.includes(code)
      ? 2
      : args.previous?.communeCodes.includes(code)
        ? 1
        : 0;
  return args.codes.filter((code) => {
    const level = args.inside.includes(code) ? 2 : 1;
    return (
      level >
      Math.max(mine(code), levelElsewhere(args.coverage, code, args.clusterId))
    );
  });
}
