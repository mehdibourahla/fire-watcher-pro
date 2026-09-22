import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CivilHazard, CivilPublication } from "@/lib/civil-publication";

const publicationFields =
  "id,ita_report_id,incident_index,hazard,summary,area_id,source_name,source_url,source_published_at,expires_at,state,revision,cap_references,published_at,updated_at,area:admin_units(id,code,level,parent_id,lat,lon,name_fr,name_ar,name_en,name_kab)";

export const civilPublicationsQuery = (includeHistory = false, page = 0) =>
  queryOptions({
    queryKey: ["civil-publications", includeHistory, page],
    queryFn: async (): Promise<CivilPublication[]> => {
      let query = supabase
        .from("civil_publications")
        .select(publicationFields)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false })
        .range(page * 500, page * 500 + 499);
      if (!includeHistory)
        query = query
          .eq("state", "published")
          .gt(
            "source_published_at",
            new Date(Date.now() - 72 * 3_600_000).toISOString(),
          );
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as CivilPublication[];
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

export const civilPublicationQuery = (id: string) =>
  queryOptions({
    queryKey: ["civil-publication", id],
    queryFn: async (): Promise<CivilPublication | null> => {
      const { data, error } = await supabase
        .from("civil_publications")
        .select(publicationFields)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as CivilPublication | null;
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

export async function publishItaPublication(input: {
  reportId: string;
  incidentIndex: number;
  hazard: CivilHazard;
  summary: string;
  areaId: string;
  expiresAt: string;
  reason: string;
}) {
  const { data, error } = await supabase.rpc("publish_ita_publication", {
    _report_id: input.reportId,
    _incident_index: input.incidentIndex,
    _hazard: input.hazard,
    _summary: input.summary,
    _area_id: input.areaId,
    _expires_at: input.expiresAt,
    _reason: input.reason,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function reviseCivilPublication(input: {
  id: string;
  expectedRevision: number;
  action: "update" | "withdraw";
  patch?:
    | {
        hazard?: CivilHazard;
        summary?: string;
        area_id?: string;
        expires_at?: string;
      }
    | undefined;
  reason: string;
}) {
  const { data, error } = await supabase.rpc("revise_civil_publication", {
    _id: input.id,
    _expected_revision: input.expectedRevision,
    _action: input.action,
    _patch: input.patch ?? {},
    _reason: input.reason,
  });
  if (error) throw new Error(error.message);
  return data;
}
