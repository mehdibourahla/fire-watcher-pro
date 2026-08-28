import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

type Wilaya = {
  code: string;
  name_ar: string;
  name_fr: string;
  name_en: string;
  name_kab: string | null;
  lat: number;
  lon: number;
};

type Commune = Wilaya & { osm_id: number; wilaya_code: string | null };

type Settlement = {
  osm_id: number;
  name: string;
  name_ar: string | null;
  place_type: string;
  lat: number;
  lon: number;
  commune_code: string | null;
  population: number | null;
};

const DATA = join(import.meta.dirname, "..", "data", "geo");
const CHUNK = 500;

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key) {
  console.error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The service role key is required: seeding writes reference data that RLS blocks for anon.",
  );
  process.exit(1);
}

const prune = process.argv.includes("--prune");
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function read<T>(file: string, field: string): T[] {
  const raw = JSON.parse(readFileSync(join(DATA, file), "utf8")) as Record<
    string,
    unknown
  >;
  return raw[field] as T[];
}

async function upsert(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db
      .from(table)
      .upsert(rows.slice(i, i + CHUNK), { onConflict });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
}

async function idsByCode(level: string) {
  const map = new Map<string, string>();
  for (let page = 0; ; page += 1) {
    const { data, error } = await db
      .from("admin_units")
      .select("id, code")
      .eq("level", level)
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) map.set(row.code as string, row.id as string);
    if ((data ?? []).length < 1000) return map;
  }
}

const wilayas = read<Wilaya>("algeria-admin.json", "wilayas");
const communes = read<Commune>("algeria-admin.json", "communes");
const settlements = read<Settlement>("algeria-settlements.json", "settlements");

console.log(
  `seeding ${wilayas.length} wilayas, ${communes.length} communes, ${settlements.length} settlements`,
);

await upsert(
  "admin_units",
  wilayas.map((w) => ({
    level: "wilaya",
    code: w.code,
    name_ar: w.name_ar,
    name_fr: w.name_fr,
    name_en: w.name_en,
    name_kab: w.name_kab,
    lat: w.lat,
    lon: w.lon,
    parent_id: null,
  })),
  "code",
);

const wilayaId = await idsByCode("wilaya");

// a commune without an ONS code cannot be keyed stably, so it is skipped rather than duplicated
const communeRows = communes
  .filter((c) => c.code)
  .map((c) => ({
    level: "commune",
    code: c.code,
    name_ar: c.name_ar,
    name_fr: c.name_fr,
    name_en: c.name_en,
    name_kab: c.name_kab,
    lat: c.lat,
    lon: c.lon,
    parent_id: c.wilaya_code ? (wilayaId.get(c.wilaya_code) ?? null) : null,
  }));
await upsert("admin_units", communeRows, "code");

const communeId = await idsByCode("commune");

const settlementRows = settlements.map((s) => ({
  osm_id: s.osm_id,
  name: s.name,
  name_ar: s.name_ar,
  place_type: s.place_type,
  lat: s.lat,
  lon: s.lon,
  population: s.population,
  commune_id: s.commune_code ? (communeId.get(s.commune_code) ?? null) : null,
}));
await upsert("settlements", settlementRows, "osm_id");

if (prune) {
  const keep = new Set([
    ...wilayas.map((w) => w.code),
    ...communeRows.map((c) => c.code),
  ]);
  const { data: existing } = await db.from("admin_units").select("id, code");
  const stale = (existing ?? []).filter((r) => !keep.has(r.code as string));
  if (stale.length) {
    const { error } = await db
      .from("admin_units")
      .delete()
      .in(
        "id",
        stale.map((r) => r.id as string),
      );
    if (error) throw new Error(`prune failed: ${error.message}`);
    console.log(
      `pruned ${stale.length} admin_units not present in the OSM extract`,
    );
  }
  // demo fixtures carry no osm_id and duplicate real places, so they would
  // otherwise survive every reseed and produce phantom nearest-settlement hits
  const { data: fixtures, error: fixtureError } = await db
    .from("settlements")
    .delete()
    .is("osm_id", null)
    .select("id");
  if (fixtureError)
    throw new Error(`settlement prune failed: ${fixtureError.message}`);
  if (fixtures?.length)
    console.log(`pruned ${fixtures.length} settlements without an osm_id`);

  const { data: orphanSettlements } = await db
    .from("settlements")
    .select("id")
    .is("commune_id", null);
  console.log(
    `settlements without a commune: ${(orphanSettlements ?? []).length}`,
  );
}

const counts = await Promise.all(
  ["wilaya", "commune"].map(async (level) => {
    const { count } = await db
      .from("admin_units")
      .select("id", { count: "exact", head: true })
      .eq("level", level);
    return `${level}: ${count}`;
  }),
);
const { count: settlementCount } = await db
  .from("settlements")
  .select("id", { count: "exact", head: true });

await db
  .from("data_sources")
  .update({
    status: "ok",
    last_ok_at: new Date().toISOString(),
    note: `${wilayas.length} wilayas, ${communeRows.length} communes, ${settlementCount} settlements. ODbL.`,
  })
  .eq("name", "geo");

console.log(`done — ${counts.join(", ")}, settlements: ${settlementCount}`);
