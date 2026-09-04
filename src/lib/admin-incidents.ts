import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export const INCIDENT_STATUSES = [
  "ongoing",
  "contained",
  "extinguished",
  "monitoring",
  "unknown",
] as const;

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

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
};

export const officialIncidentsQuery = queryOptions({
  queryKey: ["admin", "incidents"],
  queryFn: async (): Promise<OfficialIncident[]> => {
    const { data, error } = await supabase
      .from("official_incidents")
      .select(
        "id, kind, status, precision, authority_tier, first_reported_at, last_reported_at, as_of, evidence, unlisted_at",
      )
      .order("last_reported_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as OfficialIncident[];
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
