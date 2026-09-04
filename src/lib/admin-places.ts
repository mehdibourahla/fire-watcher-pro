import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type OpenArea = {
  id: string;
  name: string | null;
  area_type: string;
  lat: number;
  lon: number;
  verified_at: string | null;
  verified_note: string | null;
};

export function openAreasQuery(verified: boolean) {
  return queryOptions({
    queryKey: ["admin", "places", "open-areas", verified],
    queryFn: async (): Promise<OpenArea[]> => {
      let q = supabase
        .from("open_areas")
        .select("id, name, area_type, lat, lon, verified_at, verified_note")
        .limit(100);
      q = verified
        ? q.not("verified_at", "is", null)
        : q.is("verified_at", null);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as OpenArea[];
    },
    staleTime: 30_000,
  });
}

export const openAreaCountsQuery = queryOptions({
  queryKey: ["admin", "places", "counts"],
  queryFn: async () => {
    const [all, verified] = await Promise.all([
      supabase.from("open_areas").select("id", { count: "exact", head: true }),
      supabase
        .from("open_areas")
        .select("id", { count: "exact", head: true })
        .not("verified_at", "is", null),
    ]);
    if (all.error) throw new Error(all.error.message);
    if (verified.error) throw new Error(verified.error.message);
    return { total: all.count ?? 0, verified: verified.count ?? 0 };
  },
  staleTime: 60_000,
});

export async function verifyOpenArea(id: string, note: string | null) {
  const { error } = await supabase.rpc("verify_open_area", {
    _area: id,
    _note: note,
    _verified: true,
  });
  if (error) throw new Error(error.message);
}
