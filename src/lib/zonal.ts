export type Point = [number, number];
export type Ring = Point[];
export type MultiPolygon = Ring[][];

const keyOf = (p: Point) => `${p[0]},${p[1]}`;

export function assembleRings(ways: Point[][]): Ring[] {
  const rings: Ring[] = [];
  const open: Point[][] = [];
  for (const way of ways) {
    if (way.length < 2) continue;
    if (keyOf(way[0]!) === keyOf(way[way.length - 1]!)) rings.push(way);
    else open.push([...way]);
  }
  while (open.length) {
    const ring = open.shift()!;
    let extended = true;
    while (extended && keyOf(ring[0]!) !== keyOf(ring[ring.length - 1]!)) {
      extended = false;
      const tail = keyOf(ring[ring.length - 1]!);
      for (let i = 0; i < open.length; i += 1) {
        const w = open[i]!;
        if (keyOf(w[0]!) === tail) ring.push(...w.slice(1));
        else if (keyOf(w[w.length - 1]!) === tail)
          ring.push(...w.slice(0, -1).reverse());
        else continue;
        open.splice(i, 1);
        extended = true;
        break;
      }
    }
    if (keyOf(ring[0]!) === keyOf(ring[ring.length - 1]!)) rings.push(ring);
  }
  return rings;
}

export function pointInRing([x, y]: Point, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

export function buildMultiPolygon(
  outers: Ring[],
  inners: Ring[],
): MultiPolygon {
  const polys: Ring[][] = outers.map((o) => [o]);
  for (const inner of inners) {
    const host = polys.find((p) => pointInRing(inner[0]!, p[0]!));
    host?.push(inner);
  }
  return polys;
}

export function pointInMultiPolygon(pt: Point, mp: MultiPolygon): boolean {
  for (const poly of mp) {
    if (!pointInRing(pt, poly[0]!)) continue;
    if (poly.slice(1).some((hole) => pointInRing(pt, hole))) continue;
    return true;
  }
  return false;
}

export function bboxOf(mp: MultiPolygon) {
  let west = Infinity,
    south = Infinity,
    east = -Infinity,
    north = -Infinity;
  for (const poly of mp)
    for (const [x, y] of poly[0]!) {
      if (x < west) west = x;
      if (x > east) east = x;
      if (y < south) south = y;
      if (y > north) north = y;
    }
  return { west, south, east, north };
}

export function sampleGrid(mp: MultiPolygon, maxPoints: number): Point[] {
  const { west, south, east, north } = bboxOf(mp);
  const n = Math.max(2, Math.ceil(Math.sqrt(maxPoints)));
  const pts: Point[] = [];
  for (let r = 0; r < n && pts.length < maxPoints; r += 1)
    for (let c = 0; c < n && pts.length < maxPoints; c += 1) {
      const p: Point = [
        west + ((c + 0.5) / n) * (east - west),
        south + ((r + 0.5) / n) * (north - south),
      ];
      if (pointInMultiPolygon(p, mp)) pts.push(p);
    }
  return pts;
}

/* ESA WorldCover v200 class codes; 0 is nodata and stays out of the denominator. */
const LANDCOVER_KEYS: Record<number, string> = {
  10: "tree",
  20: "shrub",
  30: "grass",
  40: "crop",
  50: "built",
  60: "bare",
  80: "water",
};

export type LandcoverFractions = {
  tree: number;
  shrub: number;
  grass: number;
  crop: number;
  built: number;
  bare: number;
  water: number;
  other: number;
};

export function landcoverFractions(
  values: number[],
): LandcoverFractions | null {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const v of values) {
    if (v === 0) continue;
    total += 1;
    const key = LANDCOVER_KEYS[v] ?? "other";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  if (total === 0) return null;
  const f = (k: string) => (counts[k] ?? 0) / total;
  return {
    tree: f("tree"),
    shrub: f("shrub"),
    grass: f("grass"),
    crop: f("crop"),
    built: f("built"),
    bare: f("bare"),
    water: f("water"),
    other: f("other"),
  };
}

export type SlopeStats = {
  mean_slope_deg: number;
  p90_slope_deg: number;
  pct_above_20_deg: number;
  south_facing_pct: number;
  cells: number;
};

/* rows run north to south; aspect is the downslope direction, 0 = north. */
export function slopeStats(
  elev: number[][],
  dxMeters: number,
  dyMeters: number,
  mask?: boolean[][],
): SlopeStats | null {
  const rows = elev.length;
  const cols = elev[0]?.length ?? 0;
  if (rows < 3 || cols < 3) return null;
  const slopes: number[] = [];
  let south = 0;
  let sloped = 0;
  for (let r = 1; r < rows - 1; r += 1)
    for (let c = 1; c < cols - 1; c += 1) {
      if (mask && !mask[r]?.[c]) continue;
      const dzdx = (elev[r]![c + 1]! - elev[r]![c - 1]!) / (2 * dxMeters);
      const dzdn = (elev[r - 1]![c]! - elev[r + 1]![c]!) / (2 * dyMeters);
      const slope = (Math.atan(Math.hypot(dzdx, dzdn)) * 180) / Math.PI;
      slopes.push(slope);
      if (slope < 1) continue;
      sloped += 1;
      const aspect = ((Math.atan2(-dzdx, -dzdn) * 180) / Math.PI + 360) % 360;
      if (aspect >= 135 && aspect <= 225) south += 1;
    }
  if (!slopes.length) return null;
  slopes.sort((a, b) => a - b);
  const mean = slopes.reduce((a, b) => a + b, 0) / slopes.length;
  return {
    mean_slope_deg: mean,
    p90_slope_deg:
      slopes[Math.min(slopes.length - 1, Math.floor(slopes.length * 0.9))]!,
    pct_above_20_deg:
      (100 * slopes.filter((s) => s > 20).length) / slopes.length,
    south_facing_pct: sloped ? (100 * south) / sloped : 0,
    cells: slopes.length,
  };
}
