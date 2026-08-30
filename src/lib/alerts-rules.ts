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

/**
 * McArthur / Noble terrain slope acceleration factor:
 * phi_s = exp(0.069 * slope_deg). Spread rate roughly doubles for every 10 deg uphill.
 */
export function slopeSpreadMultiplier(slopeDeg: number): number {
  const theta = Math.max(0, Math.min(45, slopeDeg));
  return Math.round(Math.exp(0.069 * theta) * 100) / 100;
}

export type TerrainSpread = {
  effectiveBearingDeg: number;
  spreadMultiplier: number;
  coneHalfAngleDeg: number;
};

/**
 * Computes the effective fire spread direction and acceleration combining
 * 10m wind vector and terrain slope/aspect from Copernicus DEM.
 */
export function effectiveSpreadVector(
  windSpeedKmh: number,
  windDirDeg: number,
  terrain?: {
    mean_slope_deg?: number;
    p90_slope_deg?: number;
    pct_above_20_deg?: number;
    south_facing_pct?: number;
  } | null,
): TerrainSpread {
  // Pure downwind bearing (wind blowing FROM windDirDeg pushes fire toward windDirDeg + 180)
  const downwindBearing = (((windDirDeg + 180) % 360) + 360) % 360;

  if (!terrain || !terrain.mean_slope_deg || terrain.mean_slope_deg < 3) {
    return {
      effectiveBearingDeg: downwindBearing,
      spreadMultiplier: 1.0,
      coneHalfAngleDeg: DOWNWIND_HALF_ANGLE_DEG,
    };
  }

  const slope = terrain.p90_slope_deg ?? terrain.mean_slope_deg;
  const slopeMult = slopeSpreadMultiplier(slope);

  // In northern Algeria's coastal ranges (Tell Atlas / Kabylie), south-facing slopes
  // are strongly pre-heated by the sun and Sirocco, with upslope driving fire northward.
  // Dominant upslope bearing (opposite of aspect):
  const upslopeBearing = (terrain.south_facing_pct ?? 50) >= 50 ? 0 : 180;

  // Vector addition of wind force + slope buoyancy force
  const windRad = (downwindBearing * Math.PI) / 180;
  const upslopeRad = (upslopeBearing * Math.PI) / 180;

  const windWeight = Math.max(5, windSpeedKmh);
  const slopeWeight = 15 * (slopeMult - 1); // slope buoyancy force

  const vx =
    windWeight * Math.sin(windRad) + slopeWeight * Math.sin(upslopeRad);
  const vy =
    windWeight * Math.cos(windRad) + slopeWeight * Math.cos(upslopeRad);

  const effectiveBearing = ((Math.atan2(vx, vy) * 180) / Math.PI + 360) % 360;

  // Steep rugged mountains create erratic wind eddies and spotting, widening the danger cone
  const coneHalfAngle =
    (terrain.pct_above_20_deg ?? 0) > 25 ? 60 : DOWNWIND_HALF_ANGLE_DEG;

  return {
    effectiveBearingDeg: Math.round(effectiveBearing),
    spreadMultiplier: slopeMult,
    coneHalfAngleDeg: coneHalfAngle,
  };
}

/** True when `target` lies inside the spread cone of a fire. */
export function downwindOf(
  spreadBearing: number | null,
  target: number,
  coneHalfAngleDeg: number = DOWNWIND_HALF_ANGLE_DEG,
): boolean {
  if (spreadBearing === null) return false;
  const diff = Math.abs(((target - spreadBearing + 540) % 360) - 180);
  return diff <= coneHalfAngleDeg;
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
