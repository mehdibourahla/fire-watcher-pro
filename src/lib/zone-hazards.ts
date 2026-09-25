export type ZoneArea = {
  lat: number;
  lon: number;
  radius_km: number;
  commune_id: string | null;
  communeCode: string | null;
  wilayaId: string | null;
};

type Ring = [number, number][];

const KM_PER_DEGREE = 111.32;

function insideRing(x: number, y: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function segmentDistance(
  px: number,
  py: number,
  [ax, ay]: [number, number],
  [bx, by]: [number, number],
) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length
    ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length))
    : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// local flat projection around the zone centre: accurate well under 1% at zone sizes (≤60 km)
export function circleTouchesRing(
  lat: number,
  lon: number,
  km: number,
  ring: Ring,
) {
  if (ring.length < 3) return false;
  const kmPerLon = KM_PER_DEGREE * Math.cos((lat * Math.PI) / 180);
  const projected: Ring = ring.map(([x, y]) => [
    (x - lon) * kmPerLon,
    (y - lat) * KM_PER_DEGREE,
  ]);
  if (insideRing(0, 0, projected)) return true;
  for (let i = 0; i < projected.length; i++) {
    const next = projected[(i + 1) % projected.length]!;
    if (segmentDistance(0, 0, projected[i]!, next) <= km) return true;
  }
  return false;
}

export const weatherConcernsZone = (
  zone: ZoneArea,
  warning: { polygon: Ring | null; wilaya_id: string | null },
) =>
  warning.polygon?.length
    ? circleTouchesRing(zone.lat, zone.lon, zone.radius_km, warning.polygon)
    : warning.wilaya_id !== null && warning.wilaya_id === zone.wilayaId;

export const officialConcernsZone = (
  zone: ZoneArea,
  incident: { commune_id: string | null; wilaya_id: string | null },
) =>
  incident.commune_id
    ? incident.commune_id === zone.commune_id
    : incident.wilaya_id !== null && incident.wilaya_id === zone.wilayaId;

export const authorityConcernsZone = (
  zone: ZoneArea,
  warning: { commune_codes: string[] | null; wilaya_id: string | null },
) =>
  warning.commune_codes?.length
    ? zone.communeCode !== null &&
      warning.commune_codes.includes(zone.communeCode)
    : warning.wilaya_id !== null && warning.wilaya_id === zone.wilayaId;

export const roadConcernsZone = (
  zone: ZoneArea,
  publication: { area_id: string },
) =>
  publication.area_id === zone.commune_id ||
  publication.area_id === zone.wilayaId;

export const ONM_SEVERITY: Record<string, number> = {
  Minor: 1,
  Moderate: 2,
  Severe: 3,
  Extreme: 4,
};
