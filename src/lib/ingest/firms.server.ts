import { isInWatchArea } from "./geo";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SourceReplayInterval } from "@/lib/source-jobs";

/** Northern Algeria plus the watched border strips: west,south,east,north.
 * Saharan gas flares south of this line are permanent thermal anomalies, not wildfires. */
const AREA = "-3.2,33.2,9.7,37.6";

const FEEDS = [
  { source: "firms", sensor: "VIIRS_SNPP", api: "VIIRS_SNPP_NRT" },
  { source: "firms", sensor: "VIIRS_NOAA20", api: "VIIRS_NOAA20_NRT" },
  { source: "firms", sensor: "VIIRS_NOAA21", api: "VIIRS_NOAA21_NRT" },
  { source: "firms", sensor: "MODIS", api: "MODIS_NRT" },
] as const;

export type FirmsRow = {
  source: string;
  sensor: string;
  detected_at: string;
  lat: number;
  lon: number;
  confidence_raw: number;
  frp_mw: number | null;
  daynight: string | null;
  natural_key: string;
  raw: Record<string, string>;
};

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const head = lines[0]!.split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    head.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
    return row;
  });
}

/** FIRMS confidence: VIIRS uses l/n/h, MODIS uses 0-100. Normalise to 0-1. */
function normaliseConfidence(value: string): number {
  const v = value.toLowerCase();
  if (v === "l") return 0.2;
  if (v === "n") return 0.6;
  if (v === "h") return 0.9;
  const num = Number(v);
  return Number.isFinite(num) ? Math.min(1, Math.max(0, num / 100)) : 0.5;
}

function toIso(date: string, time: string): string | null {
  if (!date) return null;
  const hhmm = (time || "0000").padStart(4, "0");
  const iso = `${date}T${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}:00Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

export function mapFirmsRows(
  rows: Record<string, string>[],
  sensor: string,
): FirmsRow[] {
  const out: FirmsRow[] = [];
  for (const row of rows) {
    const lat = Number(row["latitude"]);
    const lon = Number(row["longitude"]);
    const detected = toIso(row["acq_date"] ?? "", row["acq_time"] ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !detected) continue;
    if (!isInWatchArea(lat, lon)) continue;
    const frp = Number(row["frp"]);
    out.push({
      source: "firms",
      sensor,
      detected_at: detected,
      lat,
      lon,
      confidence_raw: normaliseConfidence(row["confidence"] ?? ""),
      frp_mw: Number.isFinite(frp) ? frp : null,
      daynight: (row["daynight"] ?? "").slice(0, 1) || null,
      natural_key: `firms:${sensor}:${lat.toFixed(5)}:${lon.toFixed(5)}:${detected}`,
      raw: row,
    });
  }
  return out;
}

export type FirmsRun = {
  fetched: number;
  inserted: number;
  feeds: string[];
  dataFrom?: string;
  dataThrough?: string;
  error?: string;
};

export async function ingestFirms(
  interval?: SourceReplayInterval,
): Promise<FirmsRun> {
  const key = process.env["FIRMS_MAP_KEY"];
  if (!key)
    return {
      fetched: 0,
      inserted: 0,
      feeds: [],
      error: "FIRMS_MAP_KEY missing",
    };

  const fromMs = interval ? Date.parse(interval.dataFrom) : null;
  const throughMs = interval ? Date.parse(interval.dataThrough) : null;
  if (
    interval &&
    (!Number.isFinite(fromMs) ||
      !Number.isFinite(throughMs) ||
      fromMs! >= throughMs! ||
      fromMs! < Date.now() - 10 * 86400_000)
  )
    return {
      fetched: 0,
      inserted: 0,
      feeds: [],
      error: "FIRMS replay interval is invalid or outside provider history",
    };
  const dayRange = interval
    ? Math.max(1, Math.min(10, Math.ceil((Date.now() - fromMs!) / 86400_000)))
    : 1;
  const all: FirmsRow[] = [];
  const feeds: string[] = [];
  for (const feed of FEEDS) {
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${feed.api}/${AREA}/${dayRange}`;
    try {
      const res = await fetch(url);
      const text = await res.text();
      if (!res.ok || text.startsWith("Invalid")) continue;
      const mapped = mapFirmsRows(parseCsv(text), feed.sensor).filter((row) => {
        if (!interval) return true;
        const detectedAt = Date.parse(row.detected_at);
        return detectedAt >= fromMs! && detectedAt <= throughMs!;
      });
      all.push(...mapped);
      feeds.push(`${feed.sensor}:${mapped.length}`);
    } catch {
      // feed-level failure should not abort the whole run
    }
  }

  // Zero rows from feeds that answered is a quiet day; zero feeds answering is an
  // outage (revoked key, FIRMS down) and must degrade the source, not report ok.
  if (feeds.length === 0)
    return {
      fetched: 0,
      inserted: 0,
      feeds,
      error: "all FIRMS feeds failed or returned invalid data",
    };
  if (all.length === 0)
    return {
      fetched: 0,
      inserted: 0,
      feeds,
      ...(interval === undefined
        ? {}
        : {
            dataFrom: interval.dataFrom,
            dataThrough: interval.dataThrough,
          }),
    };

  // de-duplicate within the batch, then upsert on the natural key
  const unique = new Map(all.map((r) => [r.natural_key, r]));
  const rows = [...unique.values()];
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error, count } = await supabaseAdmin
      .from("detections")
      .upsert(chunk, {
        onConflict: "natural_key",
        ignoreDuplicates: true,
        count: "exact",
      });
    if (error) throw new Error(`detections upsert failed: ${error.message}`);
    inserted += count ?? 0;
  }
  const detectedAt = rows.map((row) => row.detected_at).sort();
  const dataFrom = interval?.dataFrom ?? detectedAt[0];
  const dataThrough = interval?.dataThrough ?? detectedAt.at(-1);
  return {
    fetched: rows.length,
    inserted,
    feeds,
    ...(dataFrom === undefined ? {} : { dataFrom }),
    ...(dataThrough === undefined ? {} : { dataThrough }),
  };
}
