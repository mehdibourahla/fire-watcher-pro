import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key) {
  console.error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The service role key is required: seeding writes reference data that RLS blocks for anon.",
  );
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

const registry = JSON.parse(
  readFileSync("data/flares/algeria-persistent-sources.json", "utf8"),
) as {
  observation_days: number;
  cells: Record<string, number | string>[];
};

const rows = registry.cells.map((c) => ({
  ...c,
  observation_days: registry.observation_days,
}));

const { error: clearError } = await db
  .from("persistent_sources")
  .delete()
  .neq("id", "00000000-0000-0000-0000-000000000000");
if (clearError) throw new Error(clearError.message);

for (let i = 0; i < rows.length; i += 500) {
  const { error } = await db
    .from("persistent_sources")
    .insert(rows.slice(i, i + 500));
  if (error) throw new Error(error.message);
}
console.log(`seeded ${rows.length} persistent source cells`);
