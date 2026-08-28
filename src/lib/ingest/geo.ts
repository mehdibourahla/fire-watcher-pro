/**
 * Coarse outline of northern Algeria (Tell Atlas + steppe down to ~33.2N).
 * Detections outside this polygon are dropped: they are either in Morocco,
 * Tunisia, the Mediterranean, or Saharan gas flares — all of which made the
 * live map look like randomly scattered dots.
 */
const ALGERIA_NORTH: [number, number][] = [
  // coastline, west to east
  [-2.05, 35.1],
  [-1.3, 35.7],
  [-0.6, 35.85],
  [0.1, 36.0],
  [0.9, 36.55],
  [1.9, 36.6],
  [2.9, 36.8],
  [3.9, 36.9],
  [4.8, 36.9],
  [5.5, 37.1],
  [6.3, 37.1],
  [7.2, 37.05],
  [8.0, 36.95],
  [8.3, 36.93],
  [8.6, 36.97],
  // eastern border with Tunisia, north to south
  [8.35, 36.5],
  [8.25, 35.8],
  [8.3, 34.9],
  [7.9, 34.4],
  [7.5, 34.0],
  [7.5, 33.2],
  // southern cut-off line, east to west
  [-1.5, 33.2],
  // western border with Morocco, south to north
  [-2.0, 34.0],
  [-1.7, 34.7],
];

/**
 * Land strips beyond the Moroccan and Tunisian borders, watched so a fire does
 * not appear only once it has already crossed. Strips rather than a uniform
 * buffer: widening in every direction would re-admit the offshore ships and
 * flares ALGERIA_NORTH exists to reject.
 */
const TUNISIA_WATCH: [number, number][] = [
  [8.6, 36.97],
  [9.4, 36.9],
  [9.5, 36.0],
  [9.4, 35.0],
  [9.0, 34.4],
  [8.6, 34.0],
  [8.6, 33.2],
  [7.5, 33.2],
  [7.5, 34.0],
  [7.9, 34.4],
  [8.3, 34.9],
  [8.25, 35.8],
  [8.35, 36.5],
];

const MOROCCO_WATCH: [number, number][] = [
  [-3.05, 35.1],
  [-3.0, 34.7],
  [-3.0, 34.0],
  [-2.5, 33.2],
  [-1.5, 33.2],
  [-2.0, 34.0],
  [-1.7, 34.7],
  [-2.05, 35.1],
];

function pointInRing(
  lat: number,
  lon: number,
  ring: [number, number][],
): boolean {
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

export function isInAlgeriaNorth(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return pointInRing(lat, lon, ALGERIA_NORTH);
}

export function isInWatchArea(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return (
    pointInRing(lat, lon, ALGERIA_NORTH) ||
    pointInRing(lat, lon, TUNISIA_WATCH) ||
    pointInRing(lat, lon, MOROCCO_WATCH)
  );
}
