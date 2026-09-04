import { createClient } from "@supabase/supabase-js";

import { isInWatchArea } from "../src/lib/ingest/geo";

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key) {
  console.error(
    "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Retiring clusters rewrites state that RLS blocks for anon.",
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

const apply = process.argv.includes("--apply");

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// extinguished is included on purpose: the live map shows recently extinguished
// fires, so a cluster that was never a fire has to leave that state too
const SCANNED = ["active", "unconfirmed", "contained_guess", "extinguished"];

type Paged<T> = {
  range: (
    a: number,
    b: number,
  ) => Promise<{ data: T[] | null; error: { message: string } | null }>;
};

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

type Cluster = { id: string; state: string; lat: number; lon: number };
type Det = { cluster_id: string | null; lat: number; lon: number };

const clusters = await page<Cluster>(
  "fire_clusters",
  "id, state, lat, lon",
  (q) =>
    (q as unknown as { in: (c: string, v: string[]) => Paged<Cluster> }).in(
      "state",
      SCANNED,
    ) as Paged<Cluster>,
);
if (!clusters.length) {
  console.log("nothing to scan");
  process.exit(0);
}

const inArea = new Map<string, boolean>(clusters.map((c) => [c.id, false]));
const counts = new Map<string, number>(clusters.map((c) => [c.id, 0]));
const ids = clusters.map((c) => c.id);

for (let i = 0; i < ids.length; i += 100) {
  const slice = ids.slice(i, i + 100);
  const dets = await page<Det>(
    "detections",
    "cluster_id, lat, lon",
    (q) =>
      (q as unknown as { in: (c: string, v: string[]) => Paged<Det> }).in(
        "cluster_id",
        slice,
      ) as Paged<Det>,
  );
  for (const d of dets) {
    if (!d.cluster_id) continue;
    counts.set(d.cluster_id, (counts.get(d.cluster_id) ?? 0) + 1);
    if (isInWatchArea(d.lat, d.lon)) inArea.set(d.cluster_id, true);
  }
}

// a cluster with no detection on burnable ground could not have been created had
// the watch-area gate been applied at ingest; anything holding one real detection
// is left for the normal ageing rules
const doomed = clusters.filter(
  (c) => (counts.get(c.id) ?? 0) > 0 && !inArea.get(c.id),
);

console.log(`scanned clusters: ${clusters.length}`);
console.log(`entirely outside the watch area: ${doomed.length}`);
console.log(
  `  of which active: ${doomed.filter((c) => c.state === "active").length}`,
);
console.log(
  `  of which already extinguished: ${doomed.filter((c) => c.state === "extinguished").length}`,
);
const stranded = clusters.filter((c) => (counts.get(c.id) ?? 0) === 0);
if (stranded.length)
  console.log(
    `clusters with no detections at all (left alone): ${stranded.length}`,
  );

if (!apply) {
  console.log("\ndry run — pass --apply to retire them");
  process.exit(0);
}

let retired = 0;
for (let i = 0; i < doomed.length; i += 10) {
  const slice = doomed.slice(i, i + 10);
  const results = await Promise.all(
    slice.map((c) =>
      db.rpc("resolve_fire", {
        _cluster: c.id,
        _state: "false_positive",
        _reason: "out_of_area",
        _actor_label: "retire-out-of-area-clusters",
      }),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error)
    throw new Error(`resolve_fire failed: ${failed.error.message}`);
  const { error } = await db.from("cluster_events").insert(
    slice.map((c) => ({
      cluster_id: c.id,
      event: "state:false_positive",
      payload: { from: c.state, detections: counts.get(c.id) ?? 0 },
    })),
  );
  if (error) throw new Error(`cluster_events insert failed: ${error.message}`);
  retired += slice.length;
}

console.log(`retired ${retired} clusters`);
