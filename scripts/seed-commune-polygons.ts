import { createClient } from "@supabase/supabase-js";

import { fetchCommunePolygons } from "./overpass-communes";

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

const { polygons, relations, noRef, unclosed } = await fetchCommunePolygons();
const communes = polygons.map((p) => ({
  code: p.code,
  geom: { type: "MultiPolygon", coordinates: p.coordinates },
}));

console.log(
  `Overpass gave ${relations} relations; ${communes.length} with ref:ONS and closed rings, ${noRef} without ref:ONS, ${unclosed} unclosed`,
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
