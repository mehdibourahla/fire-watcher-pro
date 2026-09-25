import { queryOptions } from "@tanstack/react-query";
import type { FeatureCollection } from "geojson";

import type { ReportKind } from "@/lib/reports";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPages } from "@/lib/paginate";

export type OpenAreaType =
  "stadium" | "pitch" | "schoolyard" | "parking" | "square" | "beach";

export type OpenArea = {
  id: string;
  osm_type: string | null;
  osm_id: number | null;
  name: string;
  name_ar: string | null;
  area_type: OpenAreaType;
  lat: number;
  lon: number;
  commune_id: string | null;
  source: string;
  created_at: string;
};

export const openAreasQuery = queryOptions({
  queryKey: ["open_areas"],
  queryFn: () =>
    fetchAllPages<OpenArea>((from, to) =>
      supabase
        .from("open_areas")
        .select("*")
        .order("name")
        .order("id")
        .range(from, to),
    ),
});

export type HazardReport = {
  id: string;
  kind: ReportKind;
  hazard: string | null;
  sighting: "smoke" | "flames" | "smell" | "other";
  summary: string | null;
  lat: number;
  lon: number;
  commune_id: string | null;
  observed_at: string;
  created_at: string;
  expires_at: string | null;
  status: "pending" | "approved" | "rejected";
  witnesses: number;
};

/** Hazard asymmetry (CONTEXT.md): danger reports show unmoderated through safe columns only. */
export const hazardReportsQuery = queryOptions({
  queryKey: ["hazard_reports"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("hazard_reports")
      .select("*")
      .gte("observed_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
      .order("observed_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as HazardReport[];
  },
});
