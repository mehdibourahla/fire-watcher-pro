import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { AirportWeather } from "@/lib/ingest/metar";

export { isSandstorm } from "@/lib/ingest/metar";
export type { AirportWeather };

export const STATION_FRESH_HOURS = 3;

export const airportWeatherQuery = queryOptions({
  queryKey: ["airport_weather"],
  refetchInterval: 600_000,
  queryFn: async () => {
    const { data, error } = await supabase
      .from("airport_weather")
      .select(
        "station, name, lat, lon, observed_at, temp_c, wind_kt, gust_kt, visibility_m, weather, raw",
      )
      .order("station");
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      ...row,
      temp_c: row.temp_c === null ? null : Number(row.temp_c),
    })) as AirportWeather[];
  },
});
