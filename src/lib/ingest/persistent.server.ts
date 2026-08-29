import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { haversineKm } from "@/lib/nadhir";
import { fetchAllPages } from "@/lib/paginate";
import { SCREEN_RADIUS_KM } from "@/lib/persistent";

export type Source = { lat: number; lon: number; site_id: string };

export function nearestSource(
  lat: number,
  lon: number,
  sources: Source[],
): Source | null {
  let best: Source | null = null;
  let bestKm = SCREEN_RADIUS_KM;
  for (const s of sources) {
    const km = haversineKm(lat, lon, s.lat, s.lon);
    if (km <= bestKm) {
      bestKm = km;
      best = s;
    }
  }
  return best;
}

const CANDIDATE_MIN_DAYS = 14;
const CANDIDATE_MAX_CV = 0.35;
const CANDIDATE_MAX_STALE_DAYS = 2;

/** Flags only — a long-burning real fire must never be silenced by a heuristic. */
export function isPersistentCandidate(
  cluster: { firstMs: number; lastMs: number; frps: number[] },
  now: number,
): boolean {
  const spanDays = (cluster.lastMs - cluster.firstMs) / 86_400_000;
  if (spanDays < CANDIDATE_MIN_DAYS) return false;
  if ((now - cluster.lastMs) / 86_400_000 > CANDIDATE_MAX_STALE_DAYS)
    return false;
  const frps = cluster.frps.filter((f) => Number.isFinite(f) && f > 0);
  if (frps.length < 3) return false;
  const mean = frps.reduce((s, f) => s + f, 0) / frps.length;
  if (mean === 0) return false;
  const sd = Math.sqrt(
    frps.reduce((s, f) => s + (f - mean) ** 2, 0) / frps.length,
  );
  return sd / mean <= CANDIDATE_MAX_CV;
}

export async function screenPersistentSources(): Promise<{ screened: number }> {
  const sources = await fetchAllPages<Source>((from, to) =>
    supabaseAdmin
      .from("persistent_sources")
      .select("lat, lon, site_id")
      .range(from, to),
  );
  if (!sources.length) return { screened: 0 };

  const pending = await fetchAllPages<{ id: string; lat: number; lon: number }>(
    (from, to) =>
      supabaseAdmin
        .from("detections")
        .select("id, lat, lon")
        .is("fp_reason", null)
        .is("cluster_id", null)
        .range(from, to),
  );

  const byReason = new Map<string, string[]>();
  for (const det of pending) {
    const hit = nearestSource(det.lat, det.lon, sources);
    if (!hit) continue;
    const reason = `persistent_source:${hit.site_id}`;
    const bucket = byReason.get(reason);
    if (bucket) bucket.push(det.id);
    else byReason.set(reason, [det.id]);
  }

  let screened = 0;
  for (const [reason, ids] of byReason) {
    for (let i = 0; i < ids.length; i += 200) {
      const slice = ids.slice(i, i + 200);
      const { error } = await supabaseAdmin
        .from("detections")
        .update({ fp_reason: reason })
        .in("id", slice);
      if (error) throw new Error(`screen update failed: ${error.message}`);
      screened += slice.length;
    }
  }
  return { screened };
}

export async function flagPersistentCandidates(): Promise<{ flagged: number }> {
  const clusters = await fetchAllPages<{
    id: string;
    first_detected_at: string;
    last_detected_at: string;
  }>((from, to) =>
    supabaseAdmin
      .from("fire_clusters")
      .select("id, first_detected_at, last_detected_at")
      .in("state", ["active", "unconfirmed", "contained_guess"])
      .eq("suspected_persistent_source", false)
      .range(from, to),
  );
  if (!clusters.length) return { flagged: 0 };

  const now = Date.now();
  const candidates: string[] = [];
  for (let i = 0; i < clusters.length; i += 100) {
    const slice = clusters.slice(i, i + 100);
    const dets = await fetchAllPages<{
      cluster_id: string | null;
      frp_mw: number | null;
    }>((from, to) =>
      supabaseAdmin
        .from("detections")
        .select("cluster_id, frp_mw")
        .in(
          "cluster_id",
          slice.map((c) => c.id),
        )
        .range(from, to),
    );
    const byCluster = new Map<string, number[]>();
    for (const d of dets) {
      if (d.frp_mw === null || d.cluster_id === null) continue;
      const bucket = byCluster.get(d.cluster_id);
      if (bucket) bucket.push(d.frp_mw);
      else byCluster.set(d.cluster_id, [d.frp_mw]);
    }
    for (const c of slice) {
      const input = {
        firstMs: Date.parse(c.first_detected_at),
        lastMs: Date.parse(c.last_detected_at),
        frps: byCluster.get(c.id) ?? [],
      };
      if (isPersistentCandidate(input, now)) candidates.push(c.id);
    }
  }

  for (let i = 0; i < candidates.length; i += 200) {
    const { error } = await supabaseAdmin
      .from("fire_clusters")
      .update({ suspected_persistent_source: true })
      .in("id", candidates.slice(i, i + 200));
    if (error) throw new Error(`candidate flag failed: ${error.message}`);
  }
  return { flagged: candidates.length };
}
