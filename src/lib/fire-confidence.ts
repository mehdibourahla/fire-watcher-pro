import { haversineKm, type FireStage } from "./nadhir";

export type FireLevel = "heat_signal" | "probable" | "confirmed";
export type Confidence = "official" | "corroborated" | "single";
export type FireContext = {
  forestFraction: number | null;
  dangerLevel: number | null;
  nearbySighting: boolean;
  officialMention: boolean;
};

// 0.10 kept 54 of 59 DGPC-located incidents and dropped 160 of 223 unconfirmed fires (2026-09-22)
const FOREST_CONTEXT = 0.1;
const EXTREME_DANGER = 5;
const SIGHTING_RADIUS_KM = 5;
const SIGHTING_WINDOW_MS = 6 * 3_600_000;
const LINK_BEFORE_MS = 24 * 3_600_000;
const LINK_AFTER_MS = 6 * 3_600_000;

export function fireLevel(stage: FireStage, ctx: FireContext): FireLevel {
  if (stage === "confirmed") return "confirmed";
  if (stage === "candidate") return "heat_signal";
  return (ctx.forestFraction ?? 0) >= FOREST_CONTEXT ||
    (ctx.dangerLevel ?? 0) >= EXTREME_DANGER ||
    ctx.nearbySighting ||
    ctx.officialMention
    ? "probable"
    : "heat_signal";
}

export function hasSightingNear(
  fire: {
    lat: number;
    lon: number;
    first_detected_at: string;
    last_detected_at: string;
  },
  reports: readonly {
    kind: string;
    lat: number;
    lon: number;
    observed_at: string;
    status: string;
  }[],
): boolean {
  const from = Date.parse(fire.first_detected_at) - SIGHTING_WINDOW_MS;
  const to = Date.parse(fire.last_detected_at) + SIGHTING_WINDOW_MS;
  return reports.some(
    (r) =>
      r.kind === "sighting" &&
      r.status !== "rejected" &&
      Date.parse(r.observed_at) >= from &&
      Date.parse(r.observed_at) <= to &&
      haversineKm(fire.lat, fire.lon, r.lat, r.lon) <= SIGHTING_RADIUS_KM,
  );
}

export const fireConfidence = (level: FireLevel): Confidence =>
  level === "confirmed"
    ? "official"
    : level === "probable"
      ? "corroborated"
      : "single";

// a report naming only the wilaya can back one satellite fire, never pick among several
export function singleCandidateLinks(
  incidents: readonly {
    wilaya_id: string;
    commune_id: string | null;
    authority_tier: string;
    first_reported_at: string;
  }[],
  fires: readonly {
    id: string;
    wilaya_id: string | null;
    state: string;
    confirmed_at: string | null;
    last_detected_at: string;
  }[],
): Set<string> {
  const linked = new Set<string>();
  for (const incident of incidents) {
    if (incident.commune_id !== null || incident.authority_tier === "media")
      continue;
    const reported = Date.parse(incident.first_reported_at);
    const candidates = fires.filter((fire) => {
      const seen = Date.parse(fire.last_detected_at);
      return (
        fire.wilaya_id === incident.wilaya_id &&
        fire.state !== "false_positive" &&
        fire.confirmed_at === null &&
        seen >= reported - LINK_BEFORE_MS &&
        seen <= reported + LINK_AFTER_MS
      );
    });
    if (candidates.length === 1) linked.add(candidates[0]!.id);
  }
  return linked;
}
