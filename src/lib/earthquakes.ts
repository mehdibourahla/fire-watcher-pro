import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type Earthquake = {
  id: string;
  occurred_at: string;
  lat: number;
  lon: number;
  depth_km: number | null;
  magnitude: number;
  magnitude_type: string | null;
  region: string | null;
  network: string | null;
  commune_id: string | null;
  offshore: boolean;
};

export const QUAKE_WINDOW_HOURS = 72;
// shaking is felt well beyond the epicentre's commune; the zone push uses the same radius
export const QUAKE_NEARBY_RADIUS_KM = 100;

export const earthquakesQuery = queryOptions({
  queryKey: ["earthquakes"],
  refetchInterval: 120_000,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("earthquakes")
      .select(
        "id, occurred_at, lat, lon, depth_km, magnitude, magnitude_type, region, network, commune_id, offshore",
      )
      .gt(
        "occurred_at",
        new Date(Date.now() - QUAKE_WINDOW_HOURS * 3_600_000).toISOString(),
      )
      .order("occurred_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []).map((q) => ({
      ...q,
      magnitude: Number(q.magnitude),
    })) as Earthquake[];
  },
});
