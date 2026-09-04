import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type SourceHealthRow = {
  key: string | null;
  label: string | null;
  state: string | null;
  criticality: string | null;
  age_minutes: number | null;
  last_success_at: string | null;
  public_reason_code: string | null;
};

export const sourceHealthQuery = queryOptions({
  queryKey: ["admin", "sources", "health"],
  queryFn: async (): Promise<SourceHealthRow[]> => {
    const { data, error } = await supabase
      .from("source_health")
      .select(
        "key, label, state, criticality, age_minutes, last_success_at, public_reason_code",
      );
    if (error) throw new Error(error.message);
    return (data ?? []) as SourceHealthRow[];
  },
  staleTime: 30_000,
});

export type SourceGap = {
  id: string;
  contract_key: string;
  data_from: string;
  data_through: string;
  state: string;
  replay_count: number;
  detected_at: string;
};

export const openGapsQuery = queryOptions({
  queryKey: ["admin", "sources", "gaps"],
  queryFn: async (): Promise<SourceGap[]> => {
    const { data, error } = await supabase
      .from("source_gaps")
      .select(
        "id, contract_key, data_from, data_through, state, replay_count, detected_at",
      )
      .neq("state", "resolved")
      .order("detected_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as SourceGap[];
  },
  staleTime: 30_000,
});

export async function replayGap(gapId: string, reason: string | null) {
  const { error } = await supabase.rpc("replay_source_gap", {
    _gap_id: gapId,
    _reason: reason,
  });
  if (error) throw new Error(error.message);
}
