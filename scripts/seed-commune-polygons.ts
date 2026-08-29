import { createClient } from "@supabase/supabase-js";

import { assembleRings, buildMultiPolygon, type Point } from "../src/lib/zonal";

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (
  !url.startsWith("https://") &&
  !/^http:\/\/(localhost|127\.0\.0\.1)/.test(url)
) {
  console.error(
    "SUPABASE_URL must be https:// (or localhost for development).",
  );
  process.exit(1);
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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

const res = await fetch(OVERPASS, {
  method: "POST",
  body: `data=${encodeURIComponent(QUERY)}`,
  headers: {
    "content-type": "application/x-www-form-urlencoded",
    "user-agent":
      "nadhir-seed/1.0 (https://nadhir.app; open source wildfire warning)",
  },
});
if (!res.ok) {
  console.error(`Overpass returned ${res.status}`);
  process.exit(1);
}
const payload = (await res.json()) as { elements: Relation[] };

const communes: { code: string; geom: unknown }[] = [];
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
  const outerWays = ways("outer");
  const outers = assembleRings(outerWays);
  const inners = assembleRings(ways("inner"));
  if (!outers.length) {
    unclosed += 1;
    continue;
  }
  communes.push({
    code,
    geom: {
      type: "MultiPolygon",
      coordinates: buildMultiPolygon(outers, inners),
    },
  });
}

console.log(
  `Overpass gave ${payload.elements.length} relations; ${communes.length} with ref:ONS and closed rings, ${noRef} without ref:ONS, ${unclosed} unclosed`,
);

let updated = 0;
const misses: string[] = [];
for (const c of communes) {
  const { data, error } = await db
    .from("admin_units")
    .update({ geom: c.geom })
    .eq("level", "commune")
    .eq("code", c.code)
    .select("id");
  if (error)
    throw new Error(`geom update failed for ${c.code}: ${error.message}`);
  if (data?.length) updated += data.length;
  else misses.push(c.code);
}

console.log(`Updated geom for ${updated} communes`);
if (misses.length)
  console.log(
    `No admin_units match for ${misses.length} codes: ${misses.slice(0, 10).join(", ")}${misses.length > 10 ? "…" : ""}`,
  );
