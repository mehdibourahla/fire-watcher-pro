import { bearingBetween, haversineKm } from "@/lib/nadhir";

/** Spec 8.3: an unconfirmed cluster must never raise an alert. */
export const ALERTING_STATES = ["active"];
export const LIVE_STATES = ["active", "unconfirmed", "contained_guess"];

/** Spec 7.7 notification_prefs.min_confidence default. */
export const MIN_CONFIDENCE = 0.6;

/** Spec R3: emergency when a settlement is this close and downwind. */
export const SETTLEMENT_EMERGENCY_KM = 5;
export const DOWNWIND_HALF_ANGLE_DEG = 45;

export const SEVERITY = { emergency: 5, warning: 4, info: 1 } as const;

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export const compass = (deg: number) =>
  COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;

/** True when `target` lies inside the downwind cone of a spreading fire. */
export function downwindOf(
  spreadBearing: number | null,
  target: number,
): boolean {
  if (spreadBearing === null) return false;
  const diff = Math.abs(((target - spreadBearing + 540) % 360) - 180);
  return diff <= DOWNWIND_HALF_ANGLE_DEG;
}

/** Quiet hours suppress info and warning, never emergency (spec 10.2). */
export function inQuietHours(
  start: number | null,
  end: number | null,
  now = new Date(),
): boolean {
  if (start === null || end === null || start === end) return false;
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Algiers",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
  return start < end
    ? hour >= start && hour < end
    : hour >= start || hour < end;
}

/**
 * The settlement the wind is actually blowing toward, or null. Shared with the
 * alert engine so the map and R3 cannot disagree about what "downwind" means.
 */
export function downwindSettlement<
  T extends { lat: number; lon: number; name: string },
>(
  fire: { lat: number; lon: number },
  spreadBearing: number | null,
  settlements: T[],
): T | null {
  if (spreadBearing === null) return null;
  let best: T | null = null;
  let bestKm = Infinity;
  for (const s of settlements) {
    if (
      !downwindOf(
        spreadBearing,
        bearingBetween(fire.lat, fire.lon, s.lat, s.lon),
      )
    )
      continue;
    const km = haversineKm(fire.lat, fire.lon, s.lat, s.lon);
    if (km < bestKm) {
      bestKm = km;
      best = s;
    }
  }
  return best;
}
