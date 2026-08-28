import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/paginate";
import type { Locale } from "@/i18n";

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
  commune_id: string | null;
  wilaya_id: string | null;
  nearest_settlement_id: string | null;
  nearest_settlement_km: number | null;
};

export type Detection = {
  id: string;
  source: "firms" | "fci";
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
};

export type DataSource = {
  id: string;
  name: string;
  label: string;
  status: "ok" | "degraded" | "unavailable";
  last_ok_at: string | null;
  note: string | null;
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
  locale: Locale,
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

const BEARINGS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function bearingLabel(deg: number | null) {
  if (deg === null || Number.isNaN(deg)) return "—";
  return BEARINGS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
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

export function relativeTime(iso: string, locale: Locale) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale === "kab" ? "fr" : locale, {
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
      supabase.from("admin_units").select("*").order("code").range(from, to),
    ),
});

export const settlementsQuery = queryOptions({
  queryKey: ["settlements"],
  queryFn: () =>
    fetchAllPages<Settlement>((from, to) =>
      supabase.from("settlements").select("*").order("name").range(from, to),
    ),
});

export const dataSourcesQuery = queryOptions({
  queryKey: ["data_sources"],
  queryFn: async () =>
    must<DataSource[]>(
      await supabase.from("data_sources").select("*").order("name"),
    ),
});

export const riskForecastsQuery = queryOptions({
  queryKey: ["risk_forecasts"],
  queryFn: async () =>
    must<RiskForecast[]>(
      await supabase
        .from("risk_forecasts")
        .select("*")
        .order("horizon_days")
        .limit(2000),
    ),
});

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
      return {
        cluster,
        detections: (detections.data ?? []) as unknown as Detection[],
        events: (events.data ?? []) as unknown as ClusterEvent[],
      };
    },
  });
}
