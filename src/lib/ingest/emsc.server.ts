import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchAllPages } from "@/lib/paginate";
import { archivedFetch } from "@/lib/source-archive.server";

import { locateEvents, parseEmsc } from "./emsc";

const EVENTS_URL = "https://www.seismicportal.eu/fdsnws/event/1/query";
// Algeria plus the 100 km margin; locateEvents then keeps only what is near a commune
const BOX = { minlat: "18", maxlat: "38.5", minlon: "-9.7", maxlon: "13" };
// revisions arrive within hours; polling every two minutes, six hours overlaps many runs
const LOOKBACK_MS = 6 * 3_600_000;

export type EmscRun = {
  fetched: number;
  stored: number;
  outside: number;
  error?: string;
};

const store = {
  fetch: (url: string, updatedafter: string) =>
    archivedFetch(
      "emsc",
      "fdsn_events",
      url,
      { signal: AbortSignal.timeout(20_000) },
      { requestParams: { updatedafter } },
    ),
  communes: () =>
    fetchAllPages<{ id: string; lat: number; lon: number }>((from, to) =>
      supabaseAdmin
        .from("admin_units")
        .select("id, lat, lon")
        .eq("level", "commune")
        .not("lat", "is", null)
        .order("id")
        .range(from, to),
    ),
  upsert: async (rows: unknown[]) => {
    const { error } = await supabaseAdmin
      .from("earthquakes")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(rows as any, { onConflict: "id" });
    if (error) throw new Error(`earthquakes upsert failed: ${error.message}`);
  },
};

export async function ingestEmsc(
  dependencies: Partial<typeof store> = {},
  now: () => number = Date.now,
): Promise<EmscRun> {
  const deps = { ...store, ...dependencies };
  const updatedafter = new Date(now() - LOOKBACK_MS).toISOString();
  const url = new URL(EVENTS_URL);
  for (const [key, value] of Object.entries({
    format: "json",
    ...BOX,
    updatedafter,
    limit: "500",
    orderby: "time",
  }))
    url.searchParams.set(key, value);
  const res = await deps.fetch(url.toString(), updatedafter);
  if (res.status !== 204 && !res.ok)
    return { fetched: 0, stored: 0, outside: 0, error: `EMSC ${res.status}` };
  const events = parseEmsc(res.status === 204 ? null : await res.json());
  if (!events.length) return { fetched: 0, stored: 0, outside: 0 };
  const located = locateEvents(events, await deps.communes());
  if (located.length) await deps.upsert(located);
  return {
    fetched: events.length,
    stored: located.length,
    outside: events.length - located.length,
  };
}
