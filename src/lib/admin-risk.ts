import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type SnapshotRun = {
  snapshot_id: string;
  base_date: string;
  scheduled_for: string;
  status: string;
  created_at: string;
  heartbeat_at: string | null;
  finished_at: string | null;
};

export const snapshotRunsQuery = queryOptions({
  queryKey: ["admin", "risk", "runs"],
  queryFn: async (): Promise<SnapshotRun[]> => {
    const { data, error } = await supabase
      .from("risk_forecast_snapshot_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return (data ?? []) as SnapshotRun[];
  },
  staleTime: 30_000,
});

export type PublicationCheckpoint = {
  key: string;
  base_date: string;
  scheduled_for: string;
  published_at: string;
  coverage_status: string;
};

export const publicationCheckpointsQuery = queryOptions({
  queryKey: ["admin", "risk", "checkpoints"],
  queryFn: async (): Promise<PublicationCheckpoint[]> => {
    const { data, error } = await supabase
      .from("risk_publication_checkpoint")
      .select("key, base_date, scheduled_for, published_at, coverage_status")
      .order("published_at", { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return (data ?? []) as PublicationCheckpoint[];
  },
  staleTime: 30_000,
});

export async function publishSnapshot(run: SnapshotRun) {
  const { error } = await supabase.rpc("operator_publish_risk_snapshot", {
    _snapshot_id: run.snapshot_id,
    _base_date: run.base_date,
    _scheduled_for: run.scheduled_for,
  });
  if (error) throw new Error(error.message);
}

export async function discardSnapshot(run: SnapshotRun, reason: string) {
  const { error } = await supabase.rpc("operator_discard_risk_snapshot", {
    _snapshot_id: run.snapshot_id,
    _base_date: run.base_date,
    _scheduled_for: run.scheduled_for,
    _reason: reason,
  });
  if (error) throw new Error(error.message);
}
