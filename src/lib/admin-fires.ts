import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export const FIRE_STATES = [
  "unconfirmed",
  "active",
  "contained_guess",
  "extinguished",
  "false_positive",
] as const;

export type FireState = (typeof FIRE_STATES)[number];

export const RESOLUTION_REASONS = [
  "flare",
  "glint",
  "industry",
  "agri_burn",
  "out_of_area",
  "other",
] as const;

export type ResolutionReason = (typeof RESOLUTION_REASONS)[number];

export type UnresolvedFire = {
  id: string;
  short_id: string;
  lat: number;
  lon: number;
  state: string;
  confidence: number | null;
  detection_count: number | null;
  last_detected_at: string;
  updated_at: string;
};

export const unresolvedFiresQuery = queryOptions({
  queryKey: ["admin", "fires", "unresolved"],
  queryFn: async (): Promise<UnresolvedFire[]> => {
    const { data, error } = await supabase
      .from("fire_clusters")
      .select(
        "id, short_id, lat, lon, state, confidence, detection_count, last_detected_at, updated_at",
      )
      .is("resolved_at", null)
      .in("state", ["unconfirmed", "active", "contained_guess"])
      .order("confidence", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as UnresolvedFire[];
  },
  staleTime: 30_000,
});

export async function resolveFire(input: {
  id: string;
  state: FireState;
  reason: ResolutionReason | null;
  note: string | null;
  expectedUpdatedAt: string;
}) {
  const { error } = await supabase.rpc("resolve_fire", {
    _cluster: input.id,
    _state: input.state,
    _reason: input.reason,
    _note: input.note,
    _expected_updated_at: input.expectedUpdatedAt,
  });
  if (error) throw new Error(error.message);
}
