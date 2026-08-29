import { createClient } from "@supabase/supabase-js";

import {
  confidenceScore,
  stateFor,
  type Det,
} from "../src/lib/ingest/fusion.server";
import {
  nearestSource,
  type Source,
} from "../src/lib/ingest/persistent.server";

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key) {
  console.error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Reconciliation rewrites reference data that RLS blocks for anon.",
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

const DET_COLUMNS =
  "id, source, sensor, detected_at, lat, lon, confidence_raw, frp_mw, cluster_id";

type Paged<T> = {
  range: (
    a: number,
    b: number,
  ) => Promise<{ data: T[] | null; error: { message: string } | null }>;
};

// refine runs after select(): .is() lives on the filter builder, not the query builder
async function page<T>(
  table: string,
  select: string,
  refine: (q: Paged<T>) => Paged<T> = (q) => q,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const base = (
      db.from(table) as unknown as { select: (s: string) => Paged<T> }
    ).select(select);
    const { data, error } = await refine(base).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const sources = await page<Source>("persistent_sources", "lat, lon, site_id");
if (!sources.length) {
  console.error(
    "persistent_sources is empty — run `bun run seed:sources` first.",
  );
  process.exit(1);
}

const dets = await page<Det>("detections", DET_COLUMNS, (q) =>
  (q as unknown as { is: (c: string, v: null) => Paged<Det> }).is(
    "fp_reason",
    null,
  ),
);

// every live cluster is recomputed from surviving detections, so the script is
// idempotent and repairs a partially applied run rather than leaving stale counts
const screened = new Set<string>();
const affected = new Set<string>();
const siteFor = new Map<string, string>();
for (const d of dets) {
  const hit = nearestSource(d.lat, d.lon, sources);
  if (!hit) continue;
  screened.add(d.id);
  siteFor.set(d.id, hit.site_id);
  if (d.cluster_id) affected.add(d.cluster_id);
}
console.log(
  `screening ${screened.size} historical detections across ${affected.size} clusters`,
);

const byReason = new Map<string, string[]>();
for (const id of screened) {
  const reason = `persistent_source:${siteFor.get(id)}`;
  const bucket = byReason.get(reason);
  if (bucket) bucket.push(id);
  else byReason.set(reason, [id]);
}
for (const [reason, ids] of byReason) {
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await db
      .from("detections")
      .update({ fp_reason: reason, cluster_id: null })
      .in("id", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
}

// Derived from the database, not from `affected`: screening nulls cluster_id, so a
// cluster emptied by an earlier partial run is no longer reachable from detections.
const live = await page<{ id: string; state: string }>(
  "fire_clusters",
  "id, state",
  (q) =>
    (q as unknown as { in: (c: string, v: string[]) => Paged<never> }).in(
      "state",
      ["active", "unconfirmed", "contained_guess"],
    ) as unknown as Paged<{ id: string; state: string }>,
);

const current = await page<Det>("detections", DET_COLUMNS, (q) =>
  (q as unknown as { is: (c: string, v: null) => Paged<Det> }).is(
    "fp_reason",
    null,
  ),
);
const survivors = new Map<string, Det[]>();
for (const d of current) {
  if (!d.cluster_id) continue;
  const bucket = survivors.get(d.cluster_id);
  if (bucket) bucket.push(d);
  else survivors.set(d.cluster_id, [d]);
}

let resolved = 0;
let recomputed = 0;
const now = Date.now();
for (const { id: clusterId } of live) {
  const list = survivors.get(clusterId);
  if (!list?.length) {
    const { error } = await db
      .from("fire_clusters")
      // false_positive, not extinguished: a flare never went out, and
      // "extinguished" would file it in the public fire archive as a real fire
      .update({
        state: "false_positive",
        resolution_reason: "flare",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", clusterId);
    if (error) throw new Error(error.message);
    resolved += 1;
    continue;
  }
  const lat = list.reduce((s, d) => s + d.lat, 0) / list.length;
  const lon = list.reduce((s, d) => s + d.lon, 0) / list.length;
  const lastMs = Math.max(...list.map((d) => Date.parse(d.detected_at)));
  const { error } = await db
    .from("fire_clusters")
    .update({
      lat,
      lon,
      detection_count: list.length,
      confidence: confidenceScore(list),
      state: stateFor(list, lastMs, now),
    })
    .eq("id", clusterId);
  if (error) throw new Error(error.message);
  recomputed += 1;
}
console.log(`resolved ${resolved} clusters, recomputed ${recomputed}`);
