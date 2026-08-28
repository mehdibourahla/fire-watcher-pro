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
