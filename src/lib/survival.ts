import {
  LIVE_STATES,
  bearingBetween,
  haversineKm,
  unitName,
  type AdminUnit,
  type FireCluster,
  type Settlement,
} from "@/lib/nadhir";
import type { Locale } from "@/i18n";

export const SURVIVAL_AUTO_KM = 10;
// Beyond this a fire is context, not a threat to this person; showing it would overclaim.
export const SURVIVAL_THREAT_KM = 50;
export const SURVIVAL_ACTIVE_KEY = "nadhir.survival.active";
export const SURVIVAL_LAST_CHECK_KEY = "nadhir.survival.lastCheck";
export const SURVIVAL_DISMISS_KEY = "nadhir.survival.dismissed";

const NEARBY_KM = 30;

export type Threat = {
  cluster: FireCluster;
  km: number;
  bearing: number;
  closing: boolean | null;
};

export function nearestThreat(
  lat: number,
  lon: number,
  clusters: FireCluster[],
  maxKm: number = SURVIVAL_THREAT_KM,
): Threat | null {
  let best: { cluster: FireCluster; km: number } | null = null;
  for (const c of clusters) {
    if (!LIVE_STATES.includes(c.state)) continue;
    const km = haversineKm(lat, lon, c.lat, c.lon);
    if (km > maxKm) continue;
    if (!best || km < best.km) best = { cluster: c, km };
  }
  if (!best) return null;
  const { cluster, km } = best;
  const bearing = bearingBetween(lat, lon, cluster.lat, cluster.lon);
  let closing: boolean | null = null;
  if (cluster.spread_bearing_deg !== null) {
    const towardUser = bearingBetween(cluster.lat, cluster.lon, lat, lon);
    const diff = Math.abs(
      ((cluster.spread_bearing_deg - towardUser + 540) % 360) - 180,
    );
    closing = diff <= 60;
  }
  return { cluster, km, bearing, closing };
}

export type PositionCard = {
  commune: string | null;
  wilaya: string | null;
  nearest: { name: string; km: number; bearing: number } | null;
  coords: string;
};

export function formatCoords(lat: number, lon: number) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)} ${ns} · ${Math.abs(lon).toFixed(4)} ${ew}`;
}

export function positionCard(
  lat: number,
  lon: number,
  units: AdminUnit[],
  settlements: Settlement[],
  locale: Locale,
): PositionCard {
  let commune: AdminUnit | null = null;
  let communeKm = Infinity;
  for (const u of units) {
    if (u.level !== "commune") continue;
    const km = haversineKm(lat, lon, u.lat, u.lon);
    if (km < communeKm) {
      commune = u;
      communeKm = km;
    }
  }
  if (communeKm > NEARBY_KM) commune = null;
  const wilaya = commune?.parent_id
    ? (units.find((u) => u.id === commune.parent_id) ?? null)
    : null;

  let nearest: PositionCard["nearest"] = null;
  let nearestKm = Infinity;
  for (const s of settlements) {
    const km = haversineKm(lat, lon, s.lat, s.lon);
    if (km < nearestKm) {
      nearestKm = km;
      // bearing runs place -> user: "2 km south of the village" locates the caller.
      nearest = {
        name: s.name,
        km,
        bearing: bearingBetween(s.lat, s.lon, lat, lon),
      };
    }
  }
  if (nearestKm > NEARBY_KM) nearest = null;

  return {
    commune: commune ? unitName(commune, locale) : null,
    wilaya: wilaya ? unitName(wilaya, locale) : null,
    nearest,
    coords: formatCoords(lat, lon),
  };
}

// the entry sheet claimed GPS and pack work was underway regardless of outcome
export function entryStatusKey(
  hasPosition: boolean,
  denied: boolean,
  hasPack: boolean,
): string {
  if (denied) return "survival.enterDenied";
  if (!hasPosition) return "survival.enterFetching";
  return hasPack ? "survival.enterReady" : "survival.enterSaving";
}

export function checkInMessage(opts: {
  kind: "ok" | "assist";
  name: string | null;
  card: PositionCard;
  time: string;
  t: (k: string, o?: Record<string, unknown>) => string;
}): string {
  const { kind, name, card, time, t } = opts;
  const place = card.nearest
    ? `${card.nearest.name} (${card.nearest.km.toFixed(1)} km)`
    : (card.commune ?? card.coords);
  const body = t(
    kind === "ok" ? "survival.checkin.msgOk" : "survival.checkin.msgAssist",
    { place, coords: card.coords, time },
  );
  return name ? `${name}: ${body}` : body;
}
