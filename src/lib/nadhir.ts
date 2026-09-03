import { queryOptions } from "@tanstack/react-query";
import type { FeatureCollection, Geometry } from "geojson";

import { isInAlgeriaNorth } from "@/lib/ingest/geo";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/paginate";
import type { AnyLocale, Locale } from "@/i18n";
import type { SourceHealth } from "@/lib/source-health";

export type ClusterState =
  | "unconfirmed"
  | "active"
  | "contained_guess"
  | "extinguished"
  | "false_positive";

export type AdminUnit = {
  id: string;
  level: "wilaya" | "commune";
  code: string;
  name_ar: string;
  name_fr: string;
  name_en: string;
  name_kab: string | null;
  parent_id: string | null;
  lat: number;
  lon: number;
  forest_fraction: number;
  population: number | null;
};

export type FireCluster = {
  id: string;
  short_id: string;
  state: ClusterState;
  first_detected_at: string;
  last_detected_at: string;
  lat: number;
  lon: number;
  detection_count: number;
  sources: string[];
  max_frp_mw: number | null;
  confidence: number;
  est_area_ha: number | null;
  wind_speed_kmh: number | null;
  wind_dir_deg: number | null;
  spread_bearing_deg: number | null;
  wind_gust_kmh: number | null;
  vpd_kpa: number | null;
  soil_moisture_m3m3: number | null;
  commune_id: string | null;
  wilaya_id: string | null;
  nearest_settlement_id: string | null;
  nearest_settlement_km: number | null;
  confirmed_at: string | null;
  confirmed_mention_id: string | null;
};

export type FireStage = "candidate" | "detected" | "confirmed";

/* Glossary: a single look is a Candidate, two independent looks make it Detected,
 * and only an official source Confirms. Liveness stays in `state`. */
export function fireStage(cluster: {
  state: string;
  confirmed_at: string | null;
}): FireStage {
  if (cluster.confirmed_at !== null) return "confirmed";
  return cluster.state === "unconfirmed" ? "candidate" : "detected";
}

export type Detection = {
  id: string;
  source: "firms" | "fci" | "s3";
  sensor: string;
  detected_at: string;
  lat: number;
  lon: number;
  confidence_raw: number;
  frp_mw: number | null;
};

export type Settlement = {
  id: string;
  name: string;
  name_ar: string | null;
  place_type: string;
  lat: number;
  lon: number;
  commune_id: string | null;
  population: number | null;
};

export type RiskForecast = {
  id: string;
  commune_id: string;
  forecast_date: string;
  horizon_days: number;
  source: string;
  fwi: number;
  danger_level: number;
  fuel_limited: boolean;
  snapshot_id: string | null;
};

export type EffisDanger = {
  id: string;
  commune_id: string;
  date: string;
  danger_class:
    | "low"
    | "moderate"
    | "high"
    | "very_high"
    | "extreme"
    | "very_extreme"
    | "masked";
  created_at: string;
};

export type ClusterEvent = {
  id: string;
  cluster_id: string;
  event: string;
  at: string;
  payload: unknown;
};

export const LIVE_STATES: ClusterState[] = [
  "active",
  "unconfirmed",
  "contained_guess",
];

export const DANGER_LEVEL_KEYS = [
  "low",
  "moderate",
  "high",
  "very_high",
  "extreme",
] as const;

export function dangerLevelKey(level: number) {
  return DANGER_LEVEL_KEYS[Math.min(Math.max(level, 1), 5) - 1];
}

export function riskColorVar(level: number) {
  return `var(--risk-${Math.min(Math.max(level, 1), 5)})`;
}

export { dangerFromFwi as levelFromFwi } from "@/lib/ingest/fwi";

export function unitName(
  unit: Pick<AdminUnit, "name_ar" | "name_fr" | "name_en" | "name_kab">,
  locale: AnyLocale,
) {
  if (locale === "ar") return unit.name_ar;
  if (locale === "fr") return unit.name_fr;
  if (locale === "kab") return unit.name_kab ?? unit.name_fr;
  return unit.name_en;
}

/** Coordinates as a human-readable fallback, e.g. "36.6°N 4.3°E". */
export function coordLabel(lat: number, lon: number) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(1)}°${ns} ${Math.abs(lon).toFixed(1)}°${ew}`;
}

/** Never expose short_id as a place: fall back through the nearest known place. */
export function placeLabel(
  cluster: Pick<FireCluster, "lat" | "lon" | "commune_id">,
  units: AdminUnit[],
  settlements: Settlement[],
  locale: Locale,
): { name: string; approximate: boolean } {
  if (!isInAlgeriaNorth(cluster.lat, cluster.lon))
    return { name: coordLabel(cluster.lat, cluster.lon), approximate: false };
  if (cluster.commune_id) {
    const commune = units.find((u) => u.id === cluster.commune_id);
    if (commune) return { name: unitName(commune, locale), approximate: false };
  }

  let best: { name: string; km: number } | null = null;
  for (const s of settlements) {
    const km = haversineKm(cluster.lat, cluster.lon, s.lat, s.lon);
    if (!best || km < best.km) best = { name: s.name, km };
  }
  for (const u of units) {
    if (u.level !== "commune") continue;
    const km = haversineKm(cluster.lat, cluster.lon, u.lat, u.lon);
    if (!best || km < best.km) best = { name: unitName(u, locale), km };
  }

  if (best && best.km <= 60) return { name: best.name, approximate: true };
  return { name: coordLabel(cluster.lat, cluster.lon), approximate: false };
}

/** Wilaya is the administrative identity people navigate by; communes hang off it. */
export function wilayaGroups(
  units: AdminUnit[],
): { wilaya: AdminUnit; communes: AdminUnit[] }[] {
  const byParent = new Map<string, AdminUnit[]>();
  for (const u of units) {
    if (u.level !== "commune" || !u.parent_id) continue;
    const list = byParent.get(u.parent_id);
    if (list) list.push(u);
    else byParent.set(u.parent_id, [u]);
  }
  return units
    .filter((u) => u.level === "wilaya")
    .map((wilaya) => ({ wilaya, communes: byParent.get(wilaya.id) ?? [] }))
    .filter((g) => g.communes.length > 0)
    .sort((a, b) => a.wilaya.code.localeCompare(b.wilaya.code));
}

const BEARINGS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function bearingLabel(deg: number | null) {
  if (deg === null || Number.isNaN(deg)) return "—";
  return BEARINGS[Math.round((((deg % 360) + 360) % 360) / 45) % 8] ?? "—";
}

export function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function bearingBetween(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
) {
  const φ1 = (aLat * Math.PI) / 180;
  const φ2 = (bLat * Math.PI) / 180;
  const Δλ = ((bLon - aLon) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Intl has no Kabyle data; French is the closest locale Algeria actually uses. */
export function intlLocale(locale: AnyLocale): string {
  return locale === "kab" ? "fr" : locale;
}

export function relativeTime(iso: string, locale: AnyLocale, now = Date.now()) {
  const diffMs = now - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), {
    numeric: "auto",
  });
  if (Math.abs(mins) < 60) return rtf.format(-mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 48) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
}

export function algiersTime(iso: string) {
  return new Intl.DateTimeFormat("fr-DZ", {
    timeZone: "Africa/Algiers",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/* ---------- queries ---------- */

async function must<T>(result: {
  data: unknown;
  error: { message: string } | null;
}) {
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as T;
}

/** Live map: only fires detected in the last 72h, so the map shows the current
 * situation instead of every archived cluster of the season. */
export const clustersQuery = queryOptions({
  queryKey: ["clusters"],
  queryFn: async () =>
    must<FireCluster[]>(
      await supabase
        .from("fire_clusters")
        .select("*")
        .neq("state", "false_positive")
        .gte(
          "last_detected_at",
          new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
        )
        .order("last_detected_at", { ascending: false })
        .limit(500),
    ),
});

/** History is an archive, so it must not inherit the live map's 72h window. */
export const historyClustersQuery = queryOptions({
  queryKey: ["clusters", "history"],
  queryFn: async () => {
    const page = 1000;
    const all: FireCluster[] = [];
    for (let i = 0; i < 10; i += 1) {
      const { data, error } = await supabase
        .from("fire_clusters")
        .select("*")
        .neq("state", "false_positive")
        .order("first_detected_at", { ascending: false })
        .range(i * page, i * page + page - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as FireCluster[];
      all.push(...rows);
      if (rows.length < page) break;
    }
    return all;
  },
});

export const adminUnitsQuery = queryOptions({
  queryKey: ["admin_units"],
  queryFn: () =>
    fetchAllPages<AdminUnit>((from, to) =>
      supabase
        .from("admin_units")
        // never select *: geom/landcover/terrain hold megabytes per page and
        // took the SSR Worker past its memory limit (2026-08-29 outage)
        .select(
          "id, level, code, name_ar, name_fr, name_en, name_kab, parent_id, lat, lon, forest_fraction, population",
        )
        .order("code")
        .range(from, to),
    ),
});

export const settlementsQuery = queryOptions({
  queryKey: ["settlements"],
  queryFn: () =>
    fetchAllPages<Settlement>((from, to) =>
      supabase.from("settlements").select("*").order("name").range(from, to),
    ),
});

/** Latest EFFIS classification per commune (their run lags ours by design). */
export type OnmVigilance = {
  id: string;
  cap_id: string;
  title: string;
  event: string;
  severity: string;
  urgency: string;
  certainty: string;
  onset: string | null;
  expires: string | null;
  sent: string;
  area_desc: string;
  cap_url: string | null;
  wilaya_id: string | null;
  headline_fr: string | null;
};

export const onmVigilanceQuery = queryOptions({
  queryKey: ["onm_vigilance"],
  queryFn: async () =>
    must<OnmVigilance[]>(
      await supabase
        .from("onm_vigilance")
        .select(
          "id, cap_id, title, event, severity, urgency, certainty, onset, expires, sent, area_desc, cap_url, wilaya_id, headline_fr",
        )
        .gt("expires", new Date().toISOString())
        .order("sent", { ascending: false })
        .limit(300),
    ),
});

export const effisDangerQuery = queryOptions({
  queryKey: ["effis_danger"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("effis_danger")
      .select("*")
      .order("date", { ascending: false })
      .limit(1600);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as EffisDanger[];
    const latest = new Map<string, EffisDanger>();
    for (const r of rows)
      if (!latest.has(r.commune_id)) latest.set(r.commune_id, r);
    return latest;
  },
});

export const sourceHealthQuery = queryOptions({
  queryKey: ["source_health"],
  queryFn: async () =>
    must<SourceHealth[]>(
      await supabase
        .from("source_health")
        .select(
          "key, label, family, criticality, state, freshness_basis, valid_at, last_attempt_at, last_success_at, published_at, age_minutes, warning_after_minutes, stale_after_minutes, coverage_status, records_accepted, records_expected, fallback_contract_key, public_reason_code",
        )
        .order("key"),
    ),
});

export const HORIZON_DAYS = 6;

type RiskPublicationCheckpoint = {
  coverage_status: string | null;
  snapshot_id: string | null;
  base_date: string | null;
  published_at: string | null;
};

function isoDate(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString().slice(0, 10);
}

export function publishedRiskBaseDate(
  checkpoint: RiskPublicationCheckpoint | null | undefined,
) {
  if (
    checkpoint?.coverage_status !== "complete" ||
    !checkpoint.snapshot_id ||
    !isoDate(checkpoint.published_at)
  )
    return null;
  return isoDate(checkpoint.base_date);
}

export function publishedRiskSnapshot(
  checkpoint: RiskPublicationCheckpoint | null | undefined,
) {
  const base = publishedRiskBaseDate(checkpoint);
  if (!base || !checkpoint?.snapshot_id) return null;
  return { base, snapshotId: checkpoint.snapshot_id };
}

export function publishedRiskTarget(
  checkpoint: RiskPublicationCheckpoint | null | undefined,
  targetDate: string,
) {
  const publication = publishedRiskSnapshot(checkpoint);
  const targetMs = Date.parse(`${targetDate}T00:00:00Z`);
  if (!publication || !Number.isFinite(targetMs)) return null;
  const baseMs = Date.parse(`${publication.base}T00:00:00Z`);
  const horizon = (targetMs - baseMs) / 86_400_000;
  if (!Number.isInteger(horizon) || horizon < 0 || horizon >= HORIZON_DAYS)
    return null;
  return { ...publication, forecastDate: targetDate, horizon };
}

export function nationalMaximum(forecasts: RiskForecast[]) {
  let max: { level: number; fwi: number } | null = null;
  for (const r of forecasts) {
    if (r.horizon_days !== 0 || r.fuel_limited) continue;
    if (
      !max ||
      r.danger_level > max.level ||
      (r.danger_level === max.level && r.fwi > max.fwi)
    )
      max = { level: r.danger_level, fwi: r.fwi };
  }
  return max;
}

export type OfficialIncidentStatus =
  "ongoing" | "contained" | "extinguished" | "monitoring" | "unknown";

type NamedUnit = {
  name_ar: string;
  name_fr: string;
  name_en: string;
  name_kab: string | null;
  lat: number;
  lon: number;
};

export type OfficialIncident = {
  id: string;
  wilaya_id: string;
  commune_id: string | null;
  kind: "vegetation" | "agricultural" | "urban" | "unknown";
  status: OfficialIncidentStatus;
  precision: "commune" | "wilaya" | "place";
  authority_tier: "national" | "wilaya" | "forestry" | "media";
  place_text: string | null;
  first_reported_at: string;
  last_reported_at: string;
  as_of: string;
  unlisted_at: string | null;
  mention_count: number;
  evidence: string;
  commune: NamedUnit | null;
  wilaya: NamedUnit;
  latest_mention: {
    document: { url: string; published_at: string } | null;
    source: { label: string } | null;
  } | null;
};

const OFFICIAL_WINDOW_MS = 72 * 3_600_000;
const EXTINGUISHED_VISIBLE_MS = 24 * 3_600_000;

export const officialIncidentsQuery = queryOptions({
  queryKey: ["official_incidents"],
  queryFn: async () => {
    const since = new Date(Date.now() - OFFICIAL_WINDOW_MS).toISOString();
    const { data, error } = await supabase
      .from("official_incidents")
      .select(
        "id, wilaya_id, commune_id, kind, status, precision, authority_tier, place_text, first_reported_at, last_reported_at, as_of, unlisted_at, mention_count, evidence, commune:admin_units!official_incidents_commune_id_fkey(name_ar, name_fr, name_en, name_kab, lat, lon), wilaya:admin_units!official_incidents_wilaya_id_fkey(name_ar, name_fr, name_en, name_kab, lat, lon), latest_mention:incident_mentions!official_incidents_latest_mention_fkey(document:source_documents(url, published_at), source:text_sources(label))",
      )
      .gte("last_reported_at", since)
      .order("last_reported_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as OfficialIncident[];
  },
});

// polygons are fetched per incident commune and only in the browser: geom is
// megabytes per page and took the SSR Worker past its memory limit once
export function communeGeomsQuery(ids: string[]) {
  const sorted = [...ids].sort();
  return queryOptions({
    queryKey: ["commune_geoms", sorted],
    enabled: sorted.length > 0 && typeof window !== "undefined",
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_units")
        .select("id, geom")
        .in("id", sorted);
      if (error) throw new Error(error.message);
      return new Map(
        (data ?? [])
          .filter((r) => r.geom)
          .map((r) => [r.id, r.geom as unknown as Geometry]),
      );
    },
  });
}

export function officialIncidentsGeoJSON(
  incidents: OfficialIncident[],
  geoms: Map<string, Geometry | unknown>,
  now = Date.now(),
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: incidents.flatMap((i) => {
      if (
        i.status === "extinguished" &&
        now - Date.parse(i.last_reported_at) > EXTINGUISHED_VISIBLE_MS
      )
        return [];
      const polygon = i.commune_id ? geoms.get(i.commune_id) : undefined;
      const anchor = i.commune ?? i.wilaya;
      return [
        {
          type: "Feature" as const,
          geometry: polygon
            ? (polygon as Geometry)
            : { type: "Point" as const, coordinates: [anchor.lon, anchor.lat] },
          properties: {
            id: i.id,
            status: i.status,
            precision: i.precision,
            listed: i.unlisted_at === null,
            area: Boolean(polygon),
          },
        },
      ];
    }),
  };
}

export const recallDailyQuery = queryOptions({
  queryKey: ["official_incident_recall_daily"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("official_incident_recall_daily")
      .select("day, mentions, communes, with_cluster")
      .limit(7);
    if (error) throw new Error(error.message);
    return (data ?? []) as {
      day: string;
      mentions: number;
      communes: number;
      with_cluster: number;
    }[];
  },
});

export const riskForecastsQuery = queryOptions({
  queryKey: ["risk_forecasts"],
  queryFn: async () => {
    const { data: checkpoint, error } = await supabase
      .from("risk_publication_checkpoint")
      .select("coverage_status, snapshot_id, base_date, published_at")
      .eq("key", "local_fwi")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const publication = publishedRiskSnapshot(checkpoint);
    if (!publication) return [] as RiskForecast[];

    const baseMs = Date.parse(`${publication.base}T00:00:00Z`);
    const pairs = Array.from({ length: HORIZON_DAYS }, (_, h) => {
      const d = new Date(baseMs + h * 86_400_000).toISOString().slice(0, 10);
      return `and(forecast_date.eq.${d},horizon_days.eq.${h})`;
    });
    return fetchAllPages<RiskForecast>((from, to) =>
      supabase
        .rpc("current_risk_forecasts")
        .eq("source", "local_fwi")
        .eq("snapshot_id", publication.snapshotId)
        .or(pairs.join(","))
        .order("id")
        .range(from, to),
    );
  },
});

export type FireConfirmation = {
  as_of: string;
  evidence: string;
  status: string;
  document: { url: string } | null;
  source: { label: string } | null;
};

export function clusterDetailQuery(shortId: string) {
  return queryOptions({
    queryKey: ["cluster", shortId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fire_clusters")
        .select("*")
        .eq("short_id", shortId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const cluster = data as unknown as FireCluster;
      const [detections, events] = await Promise.all([
        supabase
          .from("detections")
          .select("*")
          .eq("cluster_id", cluster.id)
          .order("detected_at", { ascending: false })
          .limit(200),
        supabase
          .from("cluster_events")
          .select("*")
          .eq("cluster_id", cluster.id)
          .order("at"),
      ]);
      const confirmation = cluster.confirmed_mention_id
        ? (
            await supabase
              .from("incident_mentions")
              .select(
                "as_of, evidence, status, document:source_documents(url), source:text_sources(label)",
              )
              .eq("id", cluster.confirmed_mention_id)
              .maybeSingle()
          ).data
        : null;
      return {
        cluster,
        detections: (detections.data ?? []) as unknown as Detection[],
        events: (events.data ?? []) as unknown as ClusterEvent[],
        confirmation: (confirmation ??
          null) as unknown as FireConfirmation | null,
      };
    },
  });
}
