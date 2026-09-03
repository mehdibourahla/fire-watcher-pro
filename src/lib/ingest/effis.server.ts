import { PNG } from "pngjs";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { algiersToday } from "./algiers-date";

/* Colors and labels read off the mf010.fwi GetLegendGraphic on 2026-09-03, whose
 * labels carry the FWI thresholds: low <11.2, moderate 11.2-21.3, high 21.3-38,
 * very high 38-50, extreme 50-70, very extreme >70 — six classes starting at
 * Low, the layer has no very_low. White is EFFIS declining to rate unvegetated
 * land, recorded as masked rather than dropped. classifyPixel matching nothing
 * on a land pixel means EFFIS changed the palette — the run then classifies 0
 * and degrades the source. */
export const EFFIS_CLASSES = [
  { key: "low", rgb: [156, 255, 192] },
  { key: "moderate", rgb: [205, 226, 78] },
  { key: "high", rgb: [230, 172, 0] },
  { key: "very_high", rgb: [217, 112, 16] },
  { key: "extreme", rgb: [173, 6, 14] },
  { key: "very_extreme", rgb: [58, 0, 21] },
] as const;

export type EffisClass = (typeof EFFIS_CLASSES)[number]["key"] | "masked";

/* All of Algeria, not the northern fire-watch strip: the Saharan communes are
 * the ones whose local "Extreme" ratings most need the external comparison.
 * ~0.035°/px oversamples the 0.10° Météo-France grid safely. */
export const EFFIS_BBOX = { west: -8.7, south: 18.9, east: 12.0, north: 37.6 };
export const EFFIS_WIDTH = 592;
export const EFFIS_HEIGHT = 535;

/** STYLES is mandatory on MapServer 8, and an omitted TIME serves the layer's
 * 2021-01-01 default instead of the day asked for. */
export function effisMapUrl(date: string): string {
  return (
    "https://maps.effis.emergency.copernicus.eu/effis?service=WMS&version=1.1.1&request=GetMap" +
    `&layers=mf010.fwi&STYLES=default&srs=EPSG:4326` +
    `&bbox=${EFFIS_BBOX.west},${EFFIS_BBOX.south},${EFFIS_BBOX.east},${EFFIS_BBOX.north}` +
    `&width=${EFFIS_WIDTH}&height=${EFFIS_HEIGHT}&format=image/png&TIME=${date}`
  );
}

export function classifyPixel(
  r: number,
  g: number,
  b: number,
): EffisClass | null {
  if (r === 255 && g === 255 && b === 255) return "masked";
  for (const c of EFFIS_CLASSES)
    if (c.rgb[0] === r && c.rgb[1] === g && c.rgb[2] === b) return c.key;
  return null;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** JRC answers mapserver failures with HTTP 200 and an HTML body, so res.ok
 * alone would hand the error page to the PNG decoder and throw. */
export function pngPayloadError(
  contentType: string | null,
  body: Uint8Array,
): string | null {
  if (
    body.length >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((byte, i) => body[i] === byte)
  )
    return null;
  const kind = contentType?.split(";")[0]?.trim() || "an unknown content type";
  return `EFFIS upstream served ${kind}, not image/png`;
}

/* An EFFIS run rated low almost everywhere across the Mediterranean dry season
 * is re-initialized, not observed — seen live on 2026-08-29. Ingesting it would
 * poison the comparator with a low-everywhere day. The drought codes that used
 * to reveal this came from GetFeatureInfo, which the current server renders as
 * an unsubstituted template, so the raster itself is the remaining evidence. */
export function isColdStartDistribution(
  classes: readonly EffisClass[],
  month: number,
): boolean {
  if (month < 5 || month > 10) return false;
  const rated = classes.filter((c) => c !== "masked");
  if (rated.length < 2) return false;
  const low = rated.filter((c) => c === "low").length;
  return low / rated.length > 0.8;
}

export function pixelFor(
  lat: number,
  lon: number,
): { x: number; y: number } | null {
  const { west, south, east, north } = EFFIS_BBOX;
  if (lat < south || lat > north || lon < west || lon > east) return null;
  const x = Math.min(
    EFFIS_WIDTH - 1,
    Math.round(((lon - west) / (east - west)) * (EFFIS_WIDTH - 1)),
  );
  const y = Math.min(
    EFFIS_HEIGHT - 1,
    Math.round(((north - lat) / (north - south)) * (EFFIS_HEIGHT - 1)),
  );
  return { x, y };
}

export type EffisRun = {
  communes: number;
  classified: number;
  error?: string;
};

export async function ingestEffis(day?: string): Promise<EffisRun> {
  const runDate = day ?? algiersToday();
  const month = Number(runDate.slice(5, 7));

  const res = await fetch(effisMapUrl(runDate));
  if (!res.ok)
    return { communes: 0, classified: 0, error: `EFFIS WMS ${res.status}` };
  const body = new Uint8Array(await res.arrayBuffer());
  const payloadError = pngPayloadError(res.headers.get("content-type"), body);
  if (payloadError) return { communes: 0, classified: 0, error: payloadError };
  const png = PNG.sync.read(Buffer.from(body));
  if (png.width !== EFFIS_WIDTH || png.height !== EFFIS_HEIGHT)
    return {
      communes: 0,
      classified: 0,
      error: `EFFIS returned ${png.width}x${png.height}`,
    };

  const communes: { id: string; lat: number; lon: number }[] = [];
  for (let page = 0; ; page += 1) {
    const { data, error } = await supabaseAdmin
      .from("admin_units")
      .select("id, lat, lon")
      .eq("level", "commune")
      .order("id")
      .range(page * 1000, page * 1000 + 999);
    if (error) return { communes: 0, classified: 0, error: error.message };
    communes.push(...((data ?? []) as typeof communes));
    if ((data ?? []).length < 1000) break;
  }

  const date = runDate;
  const rows: { commune_id: string; date: string; danger_class: EffisClass }[] =
    [];
  for (const c of communes) {
    const p = pixelFor(c.lat, c.lon);
    if (!p) continue;
    const i = (EFFIS_WIDTH * p.y + p.x) << 2;
    const cls = classifyPixel(
      png.data[i] ?? 0,
      png.data[i + 1] ?? 0,
      png.data[i + 2] ?? 0,
    );
    if (cls) rows.push({ commune_id: c.id, date, danger_class: cls });
  }

  // white always matches as masked, so the palette-change alarm must count
  // danger classes only or it can never fire again
  if (rows.every((r) => r.danger_class === "masked"))
    return {
      communes: communes.length,
      classified: 0,
      error: "EFFIS map matched no commune — palette or extent changed",
    };

  if (
    isColdStartDistribution(
      rows.map((r) => r.danger_class),
      month,
    )
  )
    return {
      communes: communes.length,
      classified: 0,
      error: `EFFIS run for ${runDate} rated low almost everywhere — refusing to ingest`,
    };

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabaseAdmin
      .from("effis_danger")
      .upsert(rows.slice(i, i + 500), { onConflict: "commune_id,date" });
    if (error)
      return {
        communes: communes.length,
        classified: 0,
        error: `effis_danger upsert failed: ${error.message}`,
      };
  }

  return { communes: communes.length, classified: rows.length };
}
