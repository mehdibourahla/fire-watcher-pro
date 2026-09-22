import { haversineKm, type FireStage } from "./nadhir";

export type FireLevel = "heat_signal" | "probable" | "confirmed";
export type Confidence = "official" | "corroborated" | "single";
export type FireContext = {
  forestFraction: number | null;
  dangerLevel: number | null;
  nearbySighting: boolean;
};

// 0.10 kept 54 of 59 DGPC-located incidents and dropped 160 of 223 unconfirmed fires (2026-09-22)
const FOREST_CONTEXT = 0.1;
const EXTREME_DANGER = 5;
const SIGHTING_RADIUS_KM = 5;
const SIGHTING_WINDOW_MS = 6 * 3_600_000;

export function fireLevel(stage: FireStage, ctx: FireContext): FireLevel {
  if (stage === "confirmed") return "confirmed";
  if (stage === "candidate") return "heat_signal";
  return (ctx.forestFraction ?? 0) >= FOREST_CONTEXT ||
    (ctx.dangerLevel ?? 0) >= EXTREME_DANGER ||
    ctx.nearbySighting
    ? "probable"
    : "heat_signal";
}

export function hasSightingNear(
  fire: { lat: number; lon: number; last_detected_at: string },
  reports: readonly {
    kind: string;
    lat: number;
    lon: number;
    observed_at: string;
    status: string;
  }[],
): boolean {
  const seen = Date.parse(fire.last_detected_at);
  return reports.some(
    (r) =>
      r.kind === "sighting" &&
      r.status !== "rejected" &&
      Math.abs(Date.parse(r.observed_at) - seen) <= SIGHTING_WINDOW_MS &&
      haversineKm(fire.lat, fire.lon, r.lat, r.lon) <= SIGHTING_RADIUS_KM,
  );
}

export const fireConfidence = (level: FireLevel): Confidence =>
  level === "confirmed"
    ? "official"
    : level === "probable"
      ? "corroborated"
      : "single";
