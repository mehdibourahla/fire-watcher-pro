export type CommuneOutline = {
  c: string;
  b: [number, number, number, number];
  p: number[][][][];
};

export type CommuneAsset = { v: 1; communes: CommuneOutline[] };

function inRing(ring: number[][], lon: number, lat: number) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (
      yi! > lat !== yj! > lat &&
      lon < ((xj! - xi!) * (lat - yi!)) / (yj! - yi!) + xi!
    )
      inside = !inside;
  }
  return inside;
}

function inPolygon(rings: number[][][], lon: number, lat: number) {
  let inside = false;
  for (const ring of rings) if (inRing(ring, lon, lat)) inside = !inside;
  return inside;
}

export function resolveCommune(
  asset: CommuneAsset,
  lon: number,
  lat: number,
): string | null {
  for (const { c, b, p } of asset.communes) {
    if (lon < b[0] || lat < b[1] || lon > b[2] || lat > b[3]) continue;
    if (p.some((polygon) => inPolygon(polygon, lon, lat))) return c;
  }
  return null;
}
