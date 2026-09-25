import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type Alert = {
  id: string;
  zone_id: string | null;
  kind:
    | "fire"
    | "risk"
    | "weather"
    | "official"
    | "road"
    | "citizen"
    | "earthquake";
  severity: number;
  cluster_id: string | null;
  commune_id: string | null;
  source_id: string | null;
  title: string;
  body: string;
  distance_km: number | null;
  payload: {
    phase?: "new" | "urgent" | "growth" | "observation_ended";
    short_id?: string;
    state?: string;
    danger_level?: number;
    expires_at?: string;
    map_event?: string;
  } | null;
  read_at: string | null;
  created_at: string;
};

export const alertsQuery = queryOptions({
  queryKey: ["alerts"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("alerts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Alert[];
  },
});

export const alertFiresQuery = (ids: string[]) => {
  const sorted = [...new Set(ids)].sort();
  return queryOptions({
    queryKey: ["alert-fires", sorted],
    enabled: sorted.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fire_clusters")
        .select("id, state, last_detected_at, resolved_at")
        .in("id", sorted);
      if (error) throw new Error(error.message);
      return new Map((data ?? []).map((fire) => [fire.id, fire]));
    },
  });
};

export async function markAlertsRead(ids: string[], read: boolean) {
  if (!ids.length) return;
  const { error } = await supabase
    .from("alerts")
    .update({ read_at: read ? new Date().toISOString() : null })
    .in("id", ids);
  if (error) throw new Error(error.message);
}

export async function deleteAlerts(ids: string[]) {
  const { error } = await supabase.from("alerts").delete().in("id", ids);
  if (error) throw new Error(error.message);
}
