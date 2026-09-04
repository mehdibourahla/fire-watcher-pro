import { isInAlgeriaNorth } from "./geo";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { fetchAllPages } from "@/lib/paginate";

import { estimateAreaHa, nearestFrom } from "./fusion-geometry";
import { distinctLooks } from "@/lib/looks";
import { haversineKm } from "@/lib/nadhir";

const LIVE = ["active", "unconfirmed", "contained_guess"];
const JOIN_RADIUS_KM = 3;
const JOIN_WINDOW_H = 24;
const NEW_CLUSTER_RADIUS_KM = 2;
const MAX_SETTLEMENT_DISTANCE_KM = 15;
// 1537 real commune centroids are dense in the north; the wider cap only matters
// for the large southern communes where the nearest centroid is still correct
const MAX_COMMUNE_DISTANCE_KM = 60;
const HOUR = 3600_000;

export type Det = {
  id: string;
  source: string;
  sensor: string;
  detected_at: string;
  lat: number;
  lon: number;
  confidence_raw: number;
  frp_mw: number | null;
  cluster_id: string | null;
};

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function shortId() {
  let out = "DZ";
  for (let i = 0; i < 5; i += 1)
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

export function confidenceScore(dets: Det[]) {
  const sources = new Set(dets.map((d) => d.sensor)).size;
  const mean = dets.reduce((s, d) => s + d.confidence_raw, 0) / dets.length;
  const volume = Math.min(1, dets.length / 6);
  const multi = Math.min(1, sources / 3);
  return (
    Math.round(
      Math.min(0.99, 0.45 * mean + 0.3 * volume + 0.25 * multi) * 100,
    ) / 100
  );
}

export function stateFor(dets: Det[], lastMs: number, now: number) {
  const ageH = (now - lastMs) / HOUR;
  if (ageH > 24) return "extinguished";
  if (ageH > 6) return "contained_guess";
  if (distinctLooks(dets) >= 2) return "active";
  return "unconfirmed";
}

export type FciGrowth = {
  trend: "growing" | "steady" | "fading";
  earlier: number;
  recent: number;
  since: string;
  latestAt: string;
};

const GROWTH_WINDOW_MS = 6 * HOUR;
const GROWTH_STALE_MS = 2 * HOUR;
const GROWTH_MIN_SLOTS = 4;

/* FCI repeats every 10 minutes, so its pixel count per slot is the only series
 * dense enough to show a trend within a fire's lifetime. A falling count can be
 * cloud or smoke rather than a dying fire, so callers must not present "fading"
 * as reassurance. Halves are compared rather than single slots because adjacent
 * slots bounce by a pixel either way. */
export function fciGrowth(dets: Det[], now: number): FciGrowth | null {
  const perSlot = new Map<string, number>();
  for (const d of dets) {
    if (d.sensor !== "FCI") continue;
    const t = Date.parse(d.detected_at);
    if (!Number.isFinite(t) || now - t > GROWTH_WINDOW_MS) continue;
    perSlot.set(d.detected_at, (perSlot.get(d.detected_at) ?? 0) + 1);
  }
  if (perSlot.size < GROWTH_MIN_SLOTS) return null;

  const slots = [...perSlot.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const latestAt = slots[slots.length - 1]![0];
  if (now - Date.parse(latestAt) > GROWTH_STALE_MS) return null;

  const half = Math.floor(slots.length / 2);
  const mean = (part: [string, number][]) =>
    part.reduce((sum, [, n]) => sum + n, 0) / part.length;
  const earlier = mean(slots.slice(0, half));
  const recent = mean(slots.slice(slots.length - half));

  // a pixel of movement is threshold flicker at these counts, not a real change
  const moved = Math.abs(recent - earlier) >= 1.5;
  const trend = !moved
    ? "steady"
    : recent >= earlier * 1.5
      ? "growing"
      : recent <= earlier * 0.67
        ? "fading"
        : "steady";

  return {
    trend,
    earlier: Math.round(earlier * 10) / 10,
    recent: Math.round(recent * 10) / 10,
    since: slots[0]![0],
    latestAt,
  };
}

/** Rough burned-area proxy from detection footprint and FRP. */
/**
 * Two ingest runs can spawn separate clusters for one fire (centroid drift, a
 * cluster ageing out of the live set between passes). Fold any live clusters
 * whose centres sit within MERGE_RADIUS_KM into the oldest one.
 */
const MERGE_RADIUS_KM = 3;

export async function mergeOverlappingClusters(): Promise<string[]> {
  const list = await fetchAllPages<{
    id: string;
    lat: number;
    lon: number;
    first_detected_at: string;
  }>((from, to) =>
    supabaseAdmin
      .from("fire_clusters")
      .select("id, lat, lon, first_detected_at")
      .in("state", LIVE)
      .order("first_detected_at", { ascending: true })
      .range(from, to),
  );
  const dropped: string[] = [];
  const keepers: typeof list = [];
  const plan = new Map<string, string[]>();

  for (const c of list) {
    const host = keepers.find(
      (k) => haversineKm(k.lat, k.lon, c.lat, c.lon) <= MERGE_RADIUS_KM,
    );
    if (!host) {
      keepers.push(c);
      continue;
    }
    dropped.push(c.id);
    const bucket = plan.get(host.id);
    if (bucket) bucket.push(c.id);
    else plan.set(host.id, [c.id]);
  }

  for (const [primary, duplicates] of plan) {
    await supabaseAdmin
      .from("detections")
      .update({ cluster_id: primary })
      .in("cluster_id", duplicates);
    await supabaseAdmin
      .from("cluster_events")
      .update({ cluster_id: primary })
      .in("cluster_id", duplicates);
    await supabaseAdmin
      .from("citizen_reports")
      .update({ cluster_id: primary })
      .in("cluster_id", duplicates);
    await supabaseAdmin
      .from("alerts")
      .update({ cluster_id: primary })
      .in("cluster_id", duplicates);
    // the delete would null these FKs, orphaning an open broadcast thread
    await supabaseAdmin
      .from("cap_alerts")
      .update({ cluster_id: primary })
      .in("cluster_id", duplicates);
    await supabaseAdmin
      .from("broadcasts")
      .update({ cluster_id: primary })
      .in("cluster_id", duplicates);
    await supabaseAdmin.from("fire_clusters").delete().in("id", duplicates);
    await supabaseAdmin.from("cluster_events").insert({
      cluster_id: primary,
      event: "merged",
      payload: { merged: duplicates.length },
    });
  }

  return dropped;
}

export type FusionRun = {
  processed: number;
  clustersTouched: number;
  created: number;
  resolved: number;
};

export async function fuseDetections(lookbackHours = 48): Promise<FusionRun> {
  const now = Date.now();
  const since = new Date(now - lookbackHours * HOUR).toISOString();

  // PostgREST caps a response at 1000 rows, so page through the backlog
  const fresh: Det[] = [];
  for (let page = 0; page < 8; page += 1) {
    const { data } = await supabaseAdmin
      .from("detections")
      .select(
        "id, source, sensor, detected_at, lat, lon, confidence_raw, frp_mw, cluster_id",
      )
      .is("cluster_id", null)
      .is("fp_reason", null)
      .gte("detected_at", since)
      .order("detected_at", { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (!data?.length) break;
    fresh.push(...(data as Det[]));
    if (data.length < 1000) break;
  }

  const liveClusters = await fetchAllPages<{
    id: string;
    lat: number;
    lon: number;
    last_detected_at: string;
  }>((from, to) =>
    supabaseAdmin
      .from("fire_clusters")
      .select("id, lat, lon, last_detected_at")
      .in("state", LIVE)
      .range(from, to),
  );

  const open = liveClusters.map((c) => ({ ...c }));
  const touched = new Set<string>();
  let created = 0;

  const pending: Det[] = fresh;

  // pass 1: decide a cluster for each detection in memory (no DB round-trips)
  const assignments = new Map<string, string[]>();
  const newClusters: { id: string; seed: Det }[] = [];

  for (const det of pending) {
    const detMs = Date.parse(det.detected_at);
    let target = open.find(
      (c) =>
        haversineKm(c.lat, c.lon, det.lat, det.lon) <= JOIN_RADIUS_KM &&
        Math.abs(detMs - Date.parse(c.last_detected_at)) <=
          JOIN_WINDOW_H * HOUR,
    );

    if (!target) {
      target = open.find(
        (c) =>
          haversineKm(c.lat, c.lon, det.lat, det.lon) <= NEW_CLUSTER_RADIUS_KM,
      );
    }

    if (!target) {
      const id = crypto.randomUUID();
      target = {
        id,
        lat: det.lat,
        lon: det.lon,
        last_detected_at: det.detected_at,
      };
      open.push(target);
      newClusters.push({ id, seed: det });
      created += 1;
    }

    if (detMs > Date.parse(target.last_detected_at))
      target.last_detected_at = det.detected_at;
    const bucket = assignments.get(target.id);
    if (bucket) bucket.push(det.id);
    else assignments.set(target.id, [det.id]);
    touched.add(target.id);
  }

  // pass 2: bulk writes
  if (newClusters.length) {
    await supabaseAdmin.from("fire_clusters").insert(
      newClusters.map(({ id, seed }) => ({
        id,
        short_id: shortId(),
        state: "unconfirmed",
        first_detected_at: seed.detected_at,
        last_detected_at: seed.detected_at,
        lat: seed.lat,
        lon: seed.lon,
        sources: [seed.source],
        detection_count: 0,
        confidence: 0,
      })),
    );
    await supabaseAdmin.from("cluster_events").insert(
      newClusters.map(({ id, seed }) => ({
        cluster_id: id,
        event: "created",
        payload: { source: seed.source },
      })),
    );
  }

  for (const [clusterId, detIds] of assignments) {
    for (let i = 0; i < detIds.length; i += 200) {
      await supabaseAdmin
        .from("detections")
        .update({ cluster_id: clusterId })
        .in("id", detIds.slice(i, i + 200));
    }
  }

  // pass 3: merge clusters that ended up describing the same fire
  const dropped = await mergeOverlappingClusters();

  // recompute every live cluster (also ages out stale ones)
  const toRecompute = new Set<string>([...touched, ...open.map((c) => c.id)]);
  for (const id of dropped) toRecompute.delete(id);

  let resolved = 0;

  const settlements = await fetchAllPages<{
    id: string;
    lat: number;
    lon: number;
    commune_id: string | null;
  }>((from, to) =>
    supabaseAdmin
      .from("settlements")
      .select("id, lat, lon, commune_id")
      .range(from, to),
  );

  const units = await fetchAllPages<{
    id: string;
    level: string;
    lat: number;
    lon: number;
    parent_id: string | null;
  }>((from, to) =>
    supabaseAdmin
      .from("admin_units")
      .select("id, level, lat, lon, parent_id")
      .range(from, to),
  );
  const parentOf = new Map(units.map((u) => [u.id, u.parent_id]));
  const communes = units.filter((u) => u.level === "commune");

  const clusterIds = [...toRecompute];
  const detsByCluster = new Map<string, Det[]>();
  for (let i = 0; i < clusterIds.length; i += 100) {
    // a 100-cluster slice can hold far more than the 1000 rows PostgREST returns,
    // and a truncated slice silently skips those clusters entirely
    const data = await fetchAllPages<Det>((from, to) =>
      supabaseAdmin
        .from("detections")
        .select(
          "id, source, sensor, detected_at, lat, lon, confidence_raw, frp_mw, cluster_id",
        )
        .in("cluster_id", clusterIds.slice(i, i + 100))
        .order("id")
        .range(from, to),
    );
    for (const d of data) {
      const key = d.cluster_id!;
      const bucket = detsByCluster.get(key);
      if (bucket) bucket.push(d);
      else detsByCluster.set(key, [d]);
    }
  }

  const { data: previousStates } = await supabaseAdmin
    .from("fire_clusters")
    .select("id, state")
    .in("id", clusterIds);
  const stateBefore = new Map(
    (previousStates ?? []).map((c) => [c.id, c.state]),
  );

  const events: {
    cluster_id: string;
    event: string;
    payload: { from: string; detections: number };
  }[] = [];
  const updates: { id: string; patch: TablesUpdate<"fire_clusters"> }[] = [];

  for (const clusterId of clusterIds) {
    const list = detsByCluster.get(clusterId);
    if (!list?.length) continue;

    const lat = list.reduce((s, d) => s + d.lat, 0) / list.length;
    const lon = list.reduce((s, d) => s + d.lon, 0) / list.length;
    const times = list.map((d) => Date.parse(d.detected_at));
    const lastMs = Math.max(...times);
    const nextState = stateFor(list, lastMs, now);

    const nearestSettlement = nearestFrom(
      list,
      settlements,
      MAX_SETTLEMENT_DISTANCE_KM,
    );
    const nearestId = nearestSettlement?.id ?? null;
    const nearestKm = nearestSettlement?.km ?? null;
    const nearestCommuneId =
      nearestFrom(list, communes, MAX_COMMUNE_DISTANCE_KM)?.id ?? null;
    // a fire across the border is not "in" the nearest Algerian commune 60 km away
    const communeId = isInAlgeriaNorth(lat, lon) ? nearestCommuneId : null;
    const wilayaId = communeId ? (parentOf.get(communeId) ?? null) : null;

    updates.push({
      id: clusterId,
      patch: {
        lat,
        lon,
        state: nextState,
        first_detected_at: new Date(Math.min(...times)).toISOString(),
        last_detected_at: new Date(lastMs).toISOString(),
        detection_count: list.length,
        sources: [...new Set(list.map((d) => d.source))],
        max_frp_mw: Math.max(...list.map((d) => d.frp_mw ?? 0)) || null,
        confidence: confidenceScore(list),
        est_area_ha: estimateAreaHa(list),
        fci_growth: fciGrowth(list, now),
        nearest_settlement_id: nearestId,
        nearest_settlement_km:
          nearestKm === null ? null : Math.round(nearestKm * 10) / 10,
        commune_id: communeId,
        wilaya_id: wilayaId,
        updated_at: new Date().toISOString(),
      },
    });

    const before = stateBefore.get(clusterId);
    if (before && before !== nextState) {
      if (nextState === "extinguished") resolved += 1;
      events.push({
        cluster_id: clusterId,
        event: `state:${nextState}`,
        payload: { from: before, detections: list.length },
      });
    }
  }

  for (let i = 0; i < updates.length; i += 10) {
    const results = await Promise.all(
      updates
        .slice(i, i + 10)
        .map((u) =>
          supabaseAdmin.from("fire_clusters").update(u.patch).eq("id", u.id),
        ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error)
      throw new Error(`fire_clusters update failed: ${failed.error.message}`);
  }

  if (events.length) await supabaseAdmin.from("cluster_events").insert(events);

  return {
    processed: pending.length,
    clustersTouched: toRecompute.size,
    created,
    resolved,
  };
}
