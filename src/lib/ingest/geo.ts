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
  [8.6, 36.85],
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

export function isInAlgeriaNorth(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  let inside = false;
  for (
    let i = 0, j = ALGERIA_NORTH.length - 1;
    i < ALGERIA_NORTH.length;
    j = i++
  ) {
    const [xi, yi] = ALGERIA_NORTH[i]!;
    const [xj, yj] = ALGERIA_NORTH[j]!;
    const intersects =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
