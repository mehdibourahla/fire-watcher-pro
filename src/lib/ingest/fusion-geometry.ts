import { haversineKm } from "@/lib/nadhir";

export const PIXEL_GRID = 0.004;
export const PIXEL_HA = 14;

type Point = { lat: number; lon: number };
type Burning = Point & { frp_mw?: number | null };

/**
 * Distance from the fire's nearest detection, not its centroid: a fire reaches a
 * settlement from its front, and the centroid understates that by kilometres.
 */
export function nearestFrom<T extends Point & { id: string }>(
  detections: Burning[],
  candidates: T[],
  maxKm: number,
): { id: string; km: number } | null {
  let best: { id: string; km: number } | null = null;
  for (const c of candidates) {
    let km = Infinity;
    for (const d of detections) {
      const one = haversineKm(d.lat, d.lon, c.lat, c.lon);
      if (one < km) km = one;
    }
    if (km <= maxKm && (best === null || km < best.km)) best = { id: c.id, km };
  }
  return best;
}

/**
 * Observed footprint, not burned area: distinct ~375 m pixels only. Every satellite
 * pass re-detects the same pixel, so counting detections overstates by ~2.4x, and
 * summing FRP — a rate in megawatts — is not an energy and cannot yield an area.
 */
export function estimateAreaHa(detections: Burning[]): number {
  const pixels = new Set(
    detections.map(
      (d) =>
        `${Math.round(d.lat / PIXEL_GRID)},${Math.round(d.lon / PIXEL_GRID)}`,
    ),
  );
  return pixels.size * PIXEL_HA;
}
