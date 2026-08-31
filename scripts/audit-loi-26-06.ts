import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Law = {
  source: string;
  wilayas: {
    article: string;
    page: number;
    seat: string;
    communes: string[];
  }[];
};
const law = JSON.parse(
  readFileSync(
    join(import.meta.dirname, "..", "data", "geo", "loi-26-06.json"),
    "utf8",
  ),
) as Law;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array(b.length).fill(0),
  ]);
  for (let j = 0; j <= b.length; j += 1) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i += 1)
    for (let j = 1; j <= b.length; j += 1)
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return dp[a.length]![b.length]!;
}

type Unit = {
  id: string;
  code: string;
  name_fr: string;
  level: string;
  parent_id: string | null;
  lat: number;
  lon: number;
};

const units: Unit[] = [];
for (let page = 0; ; page += 1) {
  const { data, error } = await db
    .from("admin_units")
    .select("id, code, name_fr, level, parent_id, lat, lon")
    .order("id")
    .range(page * 1000, page * 1000 + 999);
  if (error) throw new Error(error.message);
  units.push(...((data ?? []) as Unit[]));
  if ((data ?? []).length < 1000) break;
}
const wilayas = units.filter((u) => u.level === "wilaya");
const communes = units.filter((u) => u.level === "commune");
const wilayaById = new Map(wilayas.map((w) => [w.id, w]));

let misfiled = 0;
let ok = 0;
let unmatchedNames = 0;
let ambiguous = 0;

for (const lw of law.wilayas) {
  const wilaya =
    wilayas.find((w) => norm(w.name_fr) === norm(lw.seat)) ??
    wilayas.find((w) => norm(w.name_fr).endsWith(norm(lw.seat)));
  if (!wilaya) {
    console.log(
      `!! no wilaya row matches law seat "${lw.seat}" (${lw.article})`,
    );
    continue;
  }
  for (const name of lw.communes) {
    const mapped =
      law.name_mappings?.[`${name} (${lw.article})`] ??
      law.name_mappings?.[name];
    if (mapped === "OPEN") {
      console.log(
        `.. ${lw.seat}: "${name}" is a documented open item (${lw.article})`,
      );
      continue;
    }
    if (mapped) {
      const code = mapped.split(" ")[0]!;
      const c = communes.find((x) => x.code === code);
      if (!c) {
        console.log(`!! mapping "${name}" -> ${mapped}: code not found`);
        continue;
      }
      const cur = c.parent_id ? wilayaById.get(c.parent_id) : null;
      if (cur?.id === wilaya.id) ok += 1;
      else {
        misfiled += 1;
        console.log(
          `-> ${c.code} ${c.name_fr}: ${cur?.name_fr ?? "(none)"} => ${wilaya.name_fr} (${lw.article}, mapped)`,
        );
      }
      continue;
    }
    let candidates = communes.filter((c) => norm(c.name_fr) === norm(name));
    let fuzzy = false;
    if (!candidates.length) {
      const target = norm(name);
      const scored = communes
        .map((c) => ({ c, d: editDistance(norm(c.name_fr), target) }))
        .filter((x) => x.d <= 2)
        .sort((a, b) => a.d - b.d);
      if (scored.length) {
        candidates = scored.filter((x) => x.d === scored[0]!.d).map((x) => x.c);
        fuzzy = true;
      }
    }
    if (!candidates.length) {
      unmatchedNames += 1;
      const near = communes
        .map((c) => ({ c, d: editDistance(norm(c.name_fr), norm(name)) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
        .map((x) => `${x.c.code} ${x.c.name_fr} (d${x.d})`)
        .join(", ");
      console.log(
        `?? ${lw.seat}: no commune named "${name}" (${lw.article}); nearest names: ${near}`,
      );
      continue;
    }
    let pick = candidates[0]!;
    if (candidates.length > 1) {
      ambiguous += 1;
      candidates.sort(
        (a, b) =>
          Math.hypot(a.lat - wilaya.lat, a.lon - wilaya.lon) -
          Math.hypot(b.lat - wilaya.lat, b.lon - wilaya.lon),
      );
      pick = candidates[0]!;
      console.log(
        `~~ "${name}" matches ${candidates.length} communes; nearest to ${lw.seat} is ${pick.code} (${candidates.map((c) => c.code).join(",")})`,
      );
    }
    const current = pick.parent_id ? wilayaById.get(pick.parent_id) : null;
    const tag = fuzzy ? ` [fuzzy "${name}" ~ "${pick.name_fr}"]` : "";
    if (current?.id === wilaya.id) ok += 1;
    else {
      misfiled += 1;
      console.log(
        `-> ${pick.code} ${pick.name_fr}: ${current?.name_fr ?? "(none)"} => ${wilaya.name_fr} (${lw.article}, p.${lw.page})${tag}`,
      );
    }
  }
}

console.log(
  `\nlaw lists ${law.wilayas.reduce((a, w) => a + w.communes.length, 0)} communes across ${law.wilayas.length} wilayas`,
);
console.log({ ok, misfiled, unmatchedNames, ambiguous });
