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
  upsert: async (rows: unknown[]) => {
    const { error } = await supabaseAdmin
      .from("airport_weather")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(rows as any, { onConflict: "station" });
    if (error)
      throw new Error(`airport_weather upsert failed: ${error.message}`);
  },
};

export async function ingestMetar(
  dependencies: Partial<typeof store> = {},
): Promise<MetarRun> {
  const deps = { ...store, ...dependencies };
  const res = await deps.fetch();
  if (res.status === 204) return { fetched: 0, stored: 0 };
  if (!res.ok) return { fetched: 0, stored: 0, error: `METAR ${res.status}` };
  const rows = parseMetar(await res.json());
  if (rows.length) await deps.upsert(rows);
  return { fetched: rows.length, stored: rows.length };
}
