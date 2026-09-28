import {
  resolveCommune,
  type CommuneAsset,
  type CommuneOutline,
} from "../src/lib/commune-resolver";

const TOLERANCE = Number(process.argv[2] ?? 0.0015);
const url = process.env["VITE_SUPABASE_URL"];
const key = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
if (!url || !key)
  throw new Error(
    "VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required",
  );

type Row = {
  code: string;
  lat: number | null;
  lon: number | null;
  geom: { type: string; coordinates: unknown };
};

const rows: Row[] = [];
for (let from = 0; ; from += 500) {
  const res = await fetch(
    `${url}/rest/v1/admin_units?select=code,lat,lon,geom&level=eq.commune&order=code&offset=${from}&limit=500`,
    { headers: { apikey: key } },
  );
  if (!res.ok) throw new Error(`admin_units ${res.status}`);
  const page = (await res.json()) as Row[];
  rows.push(...page);
  if (page.length < 500) break;
}

function perpendicular(p: number[], a: number[], b: number[]) {
  const [x, y] = p as [number, number];
  const [x1, y1] = a as [number, number];
  const [x2, y2] = b as [number, number];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  return length === 0
    ? Math.hypot(x - x1, y - y1)
    : Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / length;
}

function simplify(points: number[][]): number[][] {
  if (points.length < 3) return points;
  let index = 0;
  let max = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicular(points[i]!, points[0]!, points[points.length - 1]!);
    if (d > max) [index, max] = [i, d];
  }
  if (max <= TOLERANCE) return [points[0]!, points[points.length - 1]!];
  return [
    ...simplify(points.slice(0, index + 1)).slice(0, -1),
    ...simplify(points.slice(index)),
  ];
}

const round = (n: number) => Math.round(n * 1e4) / 1e4;

function polygons(geom: Row["geom"]): number[][][][] {
  return (
    geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates
  ) as number[][][][];
}

function outline(
  code: string,
  polys: number[][][][],
  simplifyRings: boolean,
): CommuneOutline {
  const p = polys
    .map((rings) =>
      rings
        .map((ring) =>
          (simplifyRings ? simplify(ring) : ring).map(([x, y]) => [
            round(x!),
            round(y!),
          ]),
        )
        .filter((ring) => ring.length >= 4),
    )
    .filter((rings) => rings.length > 0);
  const xs = p.flat(2).map((c) => c[0]!);
  const ys = p.flat(2).map((c) => c[1]!);
  return {
    c: code,
    b: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    p,
  };
}

const asset: CommuneAsset = {
  v: 1,
  communes: rows
    .map((r) => outline(r.code, polygons(r.geom), true))
    .filter((o) => o.p.length),
};

const fixture: { lon: number; lat: number; code: string | null }[] = [];
const step = Math.floor(rows.length / 40);
for (let i = 0; i < rows.length && fixture.length < 40; i += step) {
  for (let j = i; j < Math.min(i + step, rows.length); j++) {
    const r = rows[j]!;
    if (r.lat === null || r.lon === null) continue;
    const full: CommuneAsset = {
      v: 1,
      communes: [outline(r.code, polygons(r.geom), false)],
    };
    if (resolveCommune(full, r.lon, r.lat) !== r.code) continue;
    fixture.push({ lon: r.lon, lat: r.lat, code: r.code });
    break;
  }
}
fixture.push(
  { lon: 5, lat: 38, code: null },
  { lon: 3, lat: 37.5, code: null },
  { lon: -1, lat: 36.5, code: null },
);

const disagreements = fixture.filter(
  (f) => resolveCommune(asset, f.lon, f.lat) !== f.code,
);
const json = JSON.stringify(asset);
console.log({
  communes: asset.communes.length,
  points: asset.communes.reduce((n, o) => n + o.p.flat(2).length, 0),
  mb: (json.length / 1e6).toFixed(2),
  fixture: fixture.length,
  disagreements,
});
if (disagreements.length)
  throw new Error(
    "simplified outlines disagree with the full ones; lower the tolerance",
  );
await Bun.write("public/geo/communes.v1.json", json);
await Bun.write(
  "data/geo/commune-fixture.json",
  JSON.stringify(fixture, null, 1) + "\n",
);
