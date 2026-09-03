import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

type CommuneClimatology = {
  commune_id: string;
  days: { month: number; day: number; breakpoints: number[] }[];
};

const DATA = join(import.meta.dirname, "..", "data", "ewds", "climatology");
const CHUNK = 500;

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key) {
  console.error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The service role key is required: seeding writes reference data that RLS blocks for anon.",
  );
  process.exit(1);
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const files = readdirSync(DATA).filter((f) => f.endsWith(".json"));
if (!files.length) {
  console.error(
    `no climatology files in ${DATA} — run build-climatology.py first`,
  );
  process.exit(1);
}

const rows: Record<string, unknown>[] = [];
for (const file of files) {
  const commune = JSON.parse(
    readFileSync(join(DATA, file), "utf8"),
  ) as CommuneClimatology;
  for (const day of commune.days)
    rows.push({
      commune_id: commune.commune_id,
      month: day.month,
      day: day.day,
      breakpoints: day.breakpoints,
    });
}

console.log(`seeding ${rows.length} rows from ${files.length} communes`);

for (let i = 0; i < rows.length; i += CHUNK) {
  const { error } = await db
    .from("fwi_climatology")
    .upsert(rows.slice(i, i + CHUNK), { onConflict: "commune_id,month,day" });
  if (error) throw new Error(`fwi_climatology upsert failed: ${error.message}`);
  if (i % (CHUNK * 20) === 0)
    console.log(`${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
}

console.log(`done — ${rows.length} rows`);
