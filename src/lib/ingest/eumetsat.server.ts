import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * EUMETSAT Data Store — geostationary fire monitoring.
 *
 * MTG/FCI and MSG/SEVIRI active-fire products are distributed as netCDF/GRIB
 * granules that cannot be decoded inside the edge runtime, so this worker does
 * two things instead of a full pixel ingest:
 *
 *  1. authenticates against the Data Store (proves the credentials are alive),
 *  2. reads the catalogue for the newest active-fire granule covering Algeria
 *     and records its age, which is what the /status page reports.
 *
 * No detections are written: a granule centroid is not a fire location.
 */

const TOKEN_URL = "https://api.eumetsat.int/token";
const SEARCH_URL = "https://api.eumetsat.int/data/search-products/os";

/** MTG FCI Level 2 Active Fire Monitoring (falls back to MSG SEVIRI FRP). */
const COLLECTIONS = [
  { id: "EO:EUM:DAT:0665", sensor: "FCI" },
  { id: "EO:EUM:DAT:MSG:FRP-GRID", sensor: "SEVIRI" },
] as const;

/** Northern Algeria bbox: west,south,east,north. */
const BBOX = { west: -3, south: 33.2, east: 9, north: 37.6 };

export type EumetsatRun = {
  sensor: string | null;
  latestAt: string | null;
  ageMinutes: number | null;
  granules: number;
  inserted: number;
  error?: string;
};

async function getToken(key: string, secret: string): Promise<string | null> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${key}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

type Feature = {
  id?: string;
  properties?: { date?: string; title?: string };
};

async function searchCollection(
  token: string,
  collection: string,
): Promise<Feature[]> {
  const params = new URLSearchParams({
    format: "json",
    pi: collection,
    si: "0",
    c: "6",
    bbox: `${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north}`,
    sort: "start,time,0",
  });
  const res = await fetch(`${SEARCH_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { features?: Feature[] };
  return json.features ?? [];
}

/** "2026-08-28T14:00:00Z/2026-08-28T14:10:00Z" → end of the sensing slot. */
export function granuleTime(feature: Feature): string | null {
  const raw = feature.properties?.date ?? "";
  const end = raw.split("/").pop() ?? raw;
  const ms = Date.parse(end);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export async function ingestEumetsat(): Promise<EumetsatRun> {
  const key = process.env["EUMETSAT_CONSUMER_KEY"];
  const secret = process.env["EUMETSAT_CONSUMER_SECRET"];
  const empty: EumetsatRun = {
    sensor: null,
    latestAt: null,
    ageMinutes: null,
    granules: 0,
    inserted: 0,
  };
  if (!key || !secret)
    return { ...empty, error: "EUMETSAT credentials missing" };

  let token: string | null = null;
  try {
    token = await getToken(key, secret);
  } catch (error) {
    return {
      ...empty,
      error: error instanceof Error ? error.message : "token request failed",
    };
  }
  if (!token) return { ...empty, error: "EUMETSAT token rejected" };

  for (const collection of COLLECTIONS) {
    let features: Feature[] = [];
    try {
      features = await searchCollection(token, collection.id);
    } catch {
      continue;
    }
    if (!features.length) continue;

    const times = features
      .map(granuleTime)
      .filter((t): t is string => !!t)
      .sort()
      .reverse();
    const latestAt = times[0] ?? null;
    if (!latestAt) continue;

    const ageMinutes = Math.round((Date.now() - Date.parse(latestAt)) / 60000);

    // The granule is netCDF and cannot be decoded in the edge runtime, so this
    // worker reports feed freshness only. Writing bbox-centroid rows would put a
    // fabricated fire in the middle of Algeria.
    return {
      sensor: collection.sensor,
      latestAt,
      ageMinutes,
      granules: features.length,
      inserted: 0,
    };
  }

  return { ...empty, error: "no active-fire granules returned for Algeria" };
}
