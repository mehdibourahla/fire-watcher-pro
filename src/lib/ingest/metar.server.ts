import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { archivedFetch } from "@/lib/source-archive.server";

import { parseMetar } from "./metar";

const METAR_URL =
  "https://aviationweather.gov/api/data/metar?bbox=18.9,-8.7,37.5,12&format=json&hours=2";

export type MetarRun = { fetched: number; stored: number; error?: string };

const store = {
  fetch: () =>
    archivedFetch("metar", "metar_json", METAR_URL, {
      signal: AbortSignal.timeout(20_000),
    }),
  insert: async (rows: unknown[]): Promise<number> => {
    const { data, error } = await supabaseAdmin
      .from("airport_observations")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(rows as any, {
        onConflict: "station,observed_at",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error)
      throw new Error(`airport_observations insert failed: ${error.message}`);
    return data.length;
  },
};

export async function ingestMetar(
  dependencies: Partial<typeof store> = {},
): Promise<MetarRun> {
  const deps = { ...store, ...dependencies };
  const res = await deps.fetch();
  if (res.status === 204) return { fetched: 0, stored: 0 };
  if (!res.ok) return { fetched: 0, stored: 0, error: `METAR ${res.status}` };
  const parsed = parseMetar(await res.json());
  const stored = parsed.length ? await deps.insert(parsed) : 0;
  return { fetched: parsed.length, stored };
}
