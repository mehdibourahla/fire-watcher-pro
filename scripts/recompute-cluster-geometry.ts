import { createClient } from "@supabase/supabase-js";

import { estimateAreaHa, nearestFrom } from "../src/lib/ingest/fusion-geometry";

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

const MAX_SETTLEMENT_DISTANCE_KM = 15;

type Paged<T> = {
  range: (
    a: number,
    b: number,
  ) => Promise<{ data: T[] | null; error: { message: string } | null }>;
};

async function page<T>(table: string, select: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const q = (
      db.from(table) as unknown as { select: (s: string) => Paged<T> }
    ).select(select);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const settlements = await page<{ id: string; lat: number; lon: number }>(
  "settlements",
  "id, lat, lon",
);
const dets = await page<{
  cluster_id: string | null;
  lat: number;
  lon: number;
  frp_mw: number | null;
}>("detections", "cluster_id, lat, lon, frp_mw");

const byCluster = new Map<string, { lat: number; lon: number }[]>();
for (const d of dets) {
  if (!d.cluster_id) continue;
  const b = byCluster.get(d.cluster_id);
  if (b) b.push(d);
  else byCluster.set(d.cluster_id, [d]);
}

const clusters = await page<{
  id: string;
  short_id: string;
  est_area_ha: number | null;
  nearest_settlement_km: number | null;
}>("fire_clusters", "id, short_id, est_area_ha, nearest_settlement_km");

let changed = 0;
let areaDrop = 0;
let kmDrop = 0;
for (const c of clusters) {
  const list = byCluster.get(c.id);
  if (!list?.length) continue;
  const area = estimateAreaHa(list);
  const near = nearestFrom(list, settlements, MAX_SETTLEMENT_DISTANCE_KM);
  const { error } = await db
    .from("fire_clusters")
    .update({
      est_area_ha: area,
      nearest_settlement_id: near?.id ?? null,
      nearest_settlement_km: near?.km ?? null,
    })
    .eq("id", c.id);
  if (error) throw new Error(error.message);
  changed += 1;
  if (c.est_area_ha != null) areaDrop += c.est_area_ha - area;
  if (c.nearest_settlement_km != null && near)
    kmDrop += c.nearest_settlement_km - near.km;
}
console.log(
  `recomputed ${changed} clusters; removed ${Math.round(areaDrop).toLocaleString()} ha of overstated area and ${kmDrop.toFixed(1)} km of overstated distance`,
);
