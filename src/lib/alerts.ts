import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type Alert = {
  id: string;
  zone_id: string | null;
  kind: "fire" | "risk";
  severity: number;
  cluster_id: string | null;
  commune_id: string | null;
  title: string;
  body: string;
  distance_km: number | null;
  payload: { short_id?: string; state?: string; danger_level?: number } | null;
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

export async function markAlertRead(id: string, read: boolean) {
  const { error } = await supabase
    .from("alerts")
    .update({ read_at: read ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function markAllAlertsRead(ids: string[]) {
  if (!ids.length) return;
  const { error } = await supabase
    .from("alerts")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw new Error(error.message);
}

export async function deleteAlert(id: string) {
  const { error } = await supabase.from("alerts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
