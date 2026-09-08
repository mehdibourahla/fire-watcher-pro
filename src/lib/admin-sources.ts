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

export type DeliveryChannel = "fcm" | "telegram";
export type DeliveryQueueHealth = {
  channel: DeliveryChannel;
  paused: boolean;
  pending_count: number;
  expired_count: number;
  oldest_pending_at: string | null;
};

export const deliveryQueueQuery = queryOptions({
  queryKey: ["admin", "sources", "delivery"],
  queryFn: async (): Promise<DeliveryQueueHealth[]> => {
    const { data, error } = await supabase
      .from("delivery_queue_health")
      .select(
        "channel, paused, pending_count, expired_count, oldest_pending_at",
      );
    if (error) throw new Error(error.message);
    return (data ?? []) as DeliveryQueueHealth[];
  },
  refetchInterval: 30_000,
});

export type OperationalIncident = {
  id: string;
  contract_key: string;
  reason_code: string;
  first_seen_at: string;
  last_seen_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
};

export const operationalIncidentsQuery = queryOptions({
  queryKey: ["admin", "sources", "incidents"],
  queryFn: async (): Promise<OperationalIncident[]> => {
    const { data, error } = await supabase
      .from("operational_incidents")
      .select(
        "id, contract_key, reason_code, first_seen_at, last_seen_at, acknowledged_at, acknowledged_by, resolved_at",
      )
      .order("resolved_at", { ascending: false, nullsFirst: true })
      .order("last_seen_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as OperationalIncident[];
  },
  refetchInterval: 30_000,
});

export async function setDeliveryChannelPaused(
  channel: DeliveryChannel,
  paused: boolean,
) {
  const { error } = await supabase.rpc("set_delivery_channel_paused", {
    _channel: channel,
    _paused: paused,
  });
  if (error) throw new Error(error.message);
}

export async function acknowledgeIncident(id: string) {
  const { error } = await supabase.rpc("acknowledge_operational_incident", {
    _id: id,
  });
  if (error) throw new Error(error.message);
}
