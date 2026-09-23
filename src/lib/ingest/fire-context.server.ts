import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  hasSightingNear,
  singleCandidateLinks,
  type FireContext,
} from "@/lib/fire-confidence";
import { algiersToday } from "@/lib/ingest/algiers-date";
import { publishedRiskTarget } from "@/lib/nadhir";
import { fetchAllPages } from "@/lib/paginate";

type ContextCluster = {
  id: string;
  commune_id: string | null;
  lat: number;
  lon: number;
  first_detected_at: string;
  last_detected_at: string;
};

const SIGHTING_WINDOW_MS = 6 * 3_600_000;
const LINK_BEFORE_MS = 24 * 3_600_000;
const LINK_AFTER_MS = 6 * 3_600_000;

async function officialLinks(clusters: readonly ContextCluster[]) {
  const lastSeen = clusters
    .map((c) => Date.parse(c.last_detected_at))
    .filter(Number.isFinite);
  if (!lastSeen.length) return new Set<string>();
  const incidents = await fetchAllPages<{
    wilaya_id: string;
    commune_id: string | null;
    authority_tier: string;
    first_reported_at: string;
  }>((from, to) =>
    supabaseAdmin
      .from("official_incidents")
      .select("wilaya_id, commune_id, authority_tier, first_reported_at")
      .is("commune_id", null)
      .neq("authority_tier", "media")
      .gte(
        "first_reported_at",
        new Date(Math.min(...lastSeen) - LINK_AFTER_MS).toISOString(),
      )
      .order("first_reported_at")
      .range(from, to),
  );
  if (!incidents.length) return new Set<string>();
  const reported = incidents.map((i) => Date.parse(i.first_reported_at));
  const candidates = await fetchAllPages<{
    id: string;
    wilaya_id: string | null;
    state: string;
    confirmed_at: string | null;
    last_detected_at: string;
  }>((from, to) =>
    supabaseAdmin
      .from("fire_clusters")
      .select("id, wilaya_id, state, confirmed_at, last_detected_at")
      .in("wilaya_id", [...new Set(incidents.map((i) => i.wilaya_id))])
      .gte(
        "last_detected_at",
        new Date(Math.min(...reported) - LINK_BEFORE_MS).toISOString(),
      )
      .lte(
        "last_detected_at",
        new Date(Math.max(...reported) + LINK_AFTER_MS).toISOString(),
      )
      .order("id")
      .range(from, to),
  );
  return singleCandidateLinks(incidents, candidates);
}

export async function fireContexts(
  clusters: readonly ContextCluster[],
): Promise<Map<string, FireContext>> {
  const contexts = new Map<string, FireContext>();
  if (!clusters.length) return contexts;
  const communeIds = [
    ...new Set(clusters.flatMap((c) => (c.commune_id ? [c.commune_id] : []))),
  ];

  const forest = new Map<string, number>();
  const danger = new Map<string, number>();
  if (communeIds.length) {
    const { data: units, error } = await supabaseAdmin
      .from("admin_units")
      .select("id, forest_fraction")
      .in("id", communeIds);
    if (error) throw new Error(`fire context units: ${error.message}`);
    for (const u of units ?? []) forest.set(u.id, u.forest_fraction);

    const { data: checkpoint, error: checkpointError } = await supabaseAdmin
      .from("risk_publication_checkpoint")
      .select("coverage_status, snapshot_id, base_date, published_at")
      .eq("key", "local_fwi")
      .maybeSingle();
    if (checkpointError)
      throw new Error(`fire context checkpoint: ${checkpointError.message}`);
    const target = publishedRiskTarget(checkpoint, algiersToday());
    if (target) {
      const { data: forecasts, error: forecastError } = await supabaseAdmin
        .from("risk_forecasts")
        .select("commune_id, danger_level")
        .eq("source", "local_fwi")
        .eq("snapshot_id", target.snapshotId)
        .eq("forecast_date", target.forecastDate)
        .eq("horizon_days", target.horizon)
        .in("commune_id", communeIds);
      if (forecastError)
        throw new Error(`fire context danger: ${forecastError.message}`);
      for (const f of forecasts ?? []) danger.set(f.commune_id, f.danger_level);
    }
  }

  const oldest = Math.min(
    ...clusters
      .map((c) => Date.parse(c.first_detected_at))
      .filter(Number.isFinite),
    Date.now(),
  );
  const reports = await fetchAllPages<{
    kind: string | null;
    lat: number | null;
    lon: number | null;
    observed_at: string | null;
    status: string | null;
  }>((from, to) =>
    supabaseAdmin
      .from("hazard_reports")
      .select("kind, lat, lon, observed_at, status")
      .eq("kind", "sighting")
      .gte("observed_at", new Date(oldest - SIGHTING_WINDOW_MS).toISOString())
      .order("observed_at")
      .range(from, to),
  );
  const sightings = reports.flatMap((r) =>
    r.kind && r.lat !== null && r.lon !== null && r.observed_at && r.status
      ? [
          {
            kind: r.kind,
            lat: r.lat,
            lon: r.lon,
            observed_at: r.observed_at,
            status: r.status,
          },
        ]
      : [],
  );

  const linked = await officialLinks(clusters);
  for (const c of clusters)
    contexts.set(c.id, {
      forestFraction: c.commune_id ? (forest.get(c.commune_id) ?? null) : null,
      dangerLevel: c.commune_id ? (danger.get(c.commune_id) ?? null) : null,
      nearbySighting: hasSightingNear(c, sightings),
      officialMention: linked.has(c.id),
    });
  return contexts;
}
