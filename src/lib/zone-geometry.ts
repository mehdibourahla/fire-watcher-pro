import type { Polygon } from "geojson";

const EARTH_KM = 6371;
const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function radiusCircle(
  lat: number,
  lon: number,
  km: number,
  steps = 64,
): Polygon {
  const lat1 = rad(lat);
  const lon1 = rad(lon);
  const arc = km / EARTH_KM;
  const ring: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const bearing = (2 * Math.PI * i) / steps;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(arc) +
        Math.cos(lat1) * Math.sin(arc) * Math.cos(bearing),
    );
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(arc) * Math.cos(lat1),
        Math.cos(arc) - Math.sin(lat1) * Math.sin(lat2),
      );
    ring.push([deg(lon2), deg(lat2)]);
  }
  ring.push(ring[0]!);
  return { type: "Polygon", coordinates: [ring] };
}
