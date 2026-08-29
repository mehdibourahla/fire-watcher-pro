import { queryOptions } from "@tanstack/react-query";

import { isInAlgeriaNorth } from "@/lib/ingest/geo";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/paginate";
import type { AnyLocale, Locale } from "@/i18n";

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

export function relativeTime(iso: string, locale: AnyLocale) {
  const diffMs = Date.now() - new Date(iso).getTime();
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

export const dataSourcesQuery = queryOptions({
  queryKey: ["data_sources"],
  queryFn: async () =>
    must<DataSource[]>(
      await supabase.from("data_sources").select("*").order("name"),
    ),
});

/* The table accumulates one 9216-row set per forecast date, so an unfiltered
 * limit both truncates communes and mixes dates. Pin to the newest date and
 * page through all of it. */
export const HORIZON_DAYS = 6;

export const riskForecastsQuery = queryOptions({
  queryKey: ["risk_forecasts"],
  queryFn: async () => {
    // forecast_date is the day a forecast is FOR, so a horizon-5 row is dated five days
    // ahead. Anchoring on max(forecast_date) selects the furthest horizon and returns no
    // horizon-0 row at all, which renders today's national danger as the seed value.
    const { data: latest, error } = await supabase
      .from("risk_forecasts")
      .select("forecast_date")
      .eq("horizon_days", 0)
      .order("forecast_date", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const base = (latest?.[0] as { forecast_date?: string } | undefined)
      ?.forecast_date;
    if (!base) return [] as RiskForecast[];

    // Runs overlap in this table — a given date carries both today's horizon h and
    // yesterday's h+1 — so the current run is pinned date-by-date, not by range.
    const baseMs = Date.parse(`${base}T00:00:00Z`);
    const pairs = Array.from({ length: HORIZON_DAYS }, (_, h) => {
      const d = new Date(baseMs + h * 86_400_000).toISOString().slice(0, 10);
      return `and(forecast_date.eq.${d},horizon_days.eq.${h})`;
    });
    return fetchAllPages<RiskForecast>((from, to) =>
      supabase
        .from("risk_forecasts")
        .select("*")
        .or(pairs.join(","))
        .order("id")
        .range(from, to),
    );
  },
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
