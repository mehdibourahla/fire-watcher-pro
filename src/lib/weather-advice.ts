import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type WeatherAdvice = {
  id: string;
  advice: string;
  wilaya_ids: string[];
  valid_from: string | null;
  valid_to: string | null;
  created_at: string;
};

const DAY_MS = 86_400_000;

function span(from: string | null, to: string | null, fallback: string) {
  const start = Date.parse(from ?? fallback);
  return { start, end: to ? Date.parse(to) : start + DAY_MS };
}

export function adviceFor(
  warning: {
    wilaya_id: string | null;
    onset: string | null;
    expires: string | null;
    sent: string;
  },
  advice: readonly WeatherAdvice[],
): WeatherAdvice | null {
  if (!warning.wilaya_id) return null;
  const w = span(warning.onset, warning.expires, warning.sent);
  return (
    advice
      .filter((a) => {
        const a2 = span(a.valid_from, a.valid_to, a.created_at);
        return (
          a.wilaya_ids.includes(warning.wilaya_id!) &&
          a2.start <= w.end &&
          w.start <= a2.end
        );
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
  );
}

export const weatherAdviceQuery = queryOptions({
  queryKey: ["official_weather_advice"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("official_weather_advice")
      .select("id, advice, wilaya_ids, valid_from, valid_to, created_at")
      .gt("created_at", new Date(Date.now() - 3 * DAY_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as WeatherAdvice[];
  },
});
