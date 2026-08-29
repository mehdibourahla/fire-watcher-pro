import {
  assembleRings,
  buildMultiPolygon,
  type MultiPolygon,
  type Point,
} from "../src/lib/zonal";

const OVERPASS = "https://overpass-api.de/api/interpreter";
const QUERY = `
[out:json][timeout:600];
area["ISO3166-1"="DZ"][admin_level=2]->.dz;
relation(area.dz)["boundary"="administrative"]["admin_level"="8"];
out geom;
`;

type Member = {
  type: string;
  role: string;
  geometry?: { lat: number; lon: number }[];
};
type Relation = {
  type: string;
  id: number;
  tags?: Record<string, string>;
  members?: Member[];
};

export type CommunePolygon = { code: string; coordinates: MultiPolygon };

export async function fetchCommunePolygons(): Promise<{
  polygons: CommunePolygon[];
  relations: number;
  noRef: number;
  unclosed: number;
}> {
  const res = await fetch(OVERPASS, {
    method: "POST",
    body: `data=${encodeURIComponent(QUERY)}`,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent":
        "nadhir-seed/1.0 (https://nadhir.app; open source wildfire warning)",
    },
  });
  if (!res.ok) throw new Error(`Overpass returned ${res.status}`);
  const payload = (await res.json()) as { elements: Relation[] };

  const polygons: CommunePolygon[] = [];
  let unclosed = 0;
  let noRef = 0;
  for (const rel of payload.elements) {
    if (rel.type !== "relation") continue;
    const code = rel.tags?.["ref:ONS"];
    if (!code) {
      noRef += 1;
      continue;
    }
    const ways = (role: string) =>
      (rel.members ?? [])
        .filter((m) => m.type === "way" && m.role === role && m.geometry)
        .map((m) => m.geometry!.map((g): Point => [g.lon, g.lat]));
    const outers = assembleRings(ways("outer"));
    const inners = assembleRings(ways("inner"));
    if (!outers.length) {
      unclosed += 1;
      continue;
    }
    polygons.push({ code, coordinates: buildMultiPolygon(outers, inners) });
  }
  return { polygons, relations: payload.elements.length, noRef, unclosed };
}
