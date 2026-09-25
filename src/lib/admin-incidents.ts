import { infiniteQueryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { firstPage, nextOffset, pageRange, pageRows } from "@/lib/paging";
import type { Json } from "@/integrations/supabase/types";
import type { AdminUnit } from "@/lib/nadhir";

export const INCIDENT_STATUSES = [
  "ongoing",
  "contained",
  "extinguished",
  "monitoring",
  "unknown",
  "cleared",
] as const;

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

type UnitNames = Pick<
  AdminUnit,
  "name_ar" | "name_fr" | "name_en" | "name_kab"
>;

export type OfficialIncident = {
  id: string;
  kind: string;
  status: string;
  precision: string;
  authority_tier: string;
  first_reported_at: string;
  last_reported_at: string;
  as_of: string;
  evidence: string;
  unlisted_at: string | null;
  place_text: string | null;
  commune: UnitNames | null;
  wilaya: UnitNames | null;
  latest_mention: {
    document: { url: string | null; published_at: string | null } | null;
  } | null;
};

export const INCIDENT_FILTERS = ["listed", "unlisted", "all"] as const;
export type IncidentFilter = (typeof INCIDENT_FILTERS)[number];

export const officialIncidentsQuery = (filter: IncidentFilter) =>
  infiniteQueryOptions({
    queryKey: ["admin", "incidents", filter],
    initialPageParam: firstPage,
    getNextPageParam: nextOffset,
    select: pageRows,
    queryFn: async ({ pageParam }): Promise<OfficialIncident[]> => {
      let query = supabase
        .from("official_incidents")
        .select(
          "id, kind, status, precision, authority_tier, first_reported_at, last_reported_at, as_of, evidence, unlisted_at, place_text, commune:admin_units!official_incidents_commune_id_fkey(name_ar, name_fr, name_en, name_kab), wilaya:admin_units!official_incidents_wilaya_id_fkey(name_ar, name_fr, name_en, name_kab), latest_mention:incident_mentions!official_incidents_latest_mention_fkey(document:source_documents(url, published_at))",
        )
        .order("last_reported_at", { ascending: false })
        .order("id")
        .range(...pageRange(pageParam));
      if (filter === "listed") query = query.is("unlisted_at", null);
      if (filter === "unlisted") query = query.not("unlisted_at", "is", null);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as OfficialIncident[];
    },
    staleTime: 30_000,
  });

export async function editIncident(
  id: string,
  patch: Record<string, Json>,
  reason: string | null,
) {
  const { error } = await supabase.rpc("operator_edit_incident", {
    _id: id,
    _patch: patch,
    _reason: reason,
  });
  if (error) throw new Error(error.message);
}
