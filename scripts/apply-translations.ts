import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key) {
  console.error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Accepted suggestions are moderator-only.",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const check = args.includes("--check");
const locale = args.find((a) => !a.startsWith("--"));
if (!locale || !["ar", "fr", "kab"].includes(locale)) {
  console.error("Usage: bun run apply:translations <ar|fr|kab> [--check]");
  process.exit(1);
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Row = {
  id: string;
  key_path: string;
  current_text: string;
  suggestion: string | null;
  verdict: string;
};

const { data, error } = await db
  .from("translation_suggestions")
  .select("id, key_path, current_text, suggestion, verdict")
  .eq("locale", locale)
  .eq("status", "accepted")
  .eq("verdict", "suggested");

if (error) {
  console.error(error.message);
  process.exit(1);
}

const rows = (data ?? []) as Row[];
if (rows.length === 0) {
  console.log("Nothing accepted and unapplied.");
  process.exit(0);
}

if (check) {
  const mod = (await import(
    join(import.meta.dirname, "..", "src", "i18n", "locales", `${locale}.ts`)
  )) as Record<string, unknown>;
  const read = (path: string) =>
    path
      .split(".")
      .reduce<unknown>(
        (acc, k) =>
          acc && typeof acc === "object"
            ? (acc as Record<string, unknown>)[k]
            : undefined,
        mod[locale],
      );

  const unapplied: string[] = [];
  const drifted: string[] = [];
  for (const row of rows) {
    if (!row.suggestion) continue;
    const live = read(row.key_path);
    if (live === row.suggestion) continue;
    if (live === row.current_text) unapplied.push(row.key_path);
    else drifted.push(row.key_path);
  }

  for (const path of drifted)
    console.log(`drifted (needs a human): ${locale}.${path}`);
  if (unapplied.length === 0) {
    console.log(`${locale}: every accepted suggestion is in the file.`);
    process.exit(0);
  }
  console.error(
    `${locale}: ${unapplied.length} accepted suggestion(s) never applied.`,
  );
  for (const path of unapplied) console.error(`  ${path}`);
  console.error("Run: bun run apply:translations " + locale);
  process.exit(1);
}

const file = join(
  import.meta.dirname,
  "..",
  "src",
  "i18n",
  "locales",
  `${locale}.ts`,
);
let source = readFileSync(file, "utf8");

const escape = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

let applied = 0;
const stale: string[] = [];

for (const row of rows) {
  if (!row.suggestion) continue;
  const leaf = row.key_path.split(".").pop() ?? "";
  // match the leaf key bound to exactly the text the reviewer saw; anything else
  // means the copy moved since they reviewed it and the change must not land
  const needle = new RegExp(
    `(\\b${leaf}:\\s*)"${escape(row.current_text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`,
  );
  if (!needle.test(source)) {
    stale.push(row.key_path);
    continue;
  }
  source = source.replace(needle, `$1"${escape(row.suggestion)}"`);
  applied += 1;
}

writeFileSync(file, source, "utf8");

console.log(`applied ${applied} of ${rows.length} to ${locale}.ts`);
if (stale.length) {
  console.log(`skipped ${stale.length} as stale (source text moved):`);
  for (const path of stale) console.log(`  ${path}`);
}
console.log("Review the diff, run the gates, and open a pull request.");
