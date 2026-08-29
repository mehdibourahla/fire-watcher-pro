import { PNG } from "pngjs";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

/* Colors verified against the ecmwf007.fwi GetLegendGraphic on 2026-08-29; the
 * WMS serves classified pixels, not FWI values (no WCS coverage exists), so the
 * palette IS the data contract. classifyPixel matching nothing on a land pixel
 * means EFFIS changed it — the run then classifies 0 and degrades the source. */
export const EFFIS_CLASSES = [
  { key: "very_low", rgb: [145, 252, 170] },
  { key: "low", rgb: [210, 225, 74] },
  { key: "moderate", rgb: [241, 179, 0] },
  { key: "high", rgb: [231, 117, 0] },
  { key: "very_high", rgb: [192, 0, 12] },
  { key: "extreme", rgb: [58, 0, 21] },
] as const;

export type EffisClass = (typeof EFFIS_CLASSES)[number]["key"];

/* All of Algeria, not the northern fire-watch strip: the Saharan communes are
 * the ones whose local "Extreme" ratings most need the external comparison.
 * ~0.035°/px oversamples ECMWF's 0.07° grid safely. */
export const EFFIS_BBOX = { west: -8.7, south: 18.9, east: 12.0, north: 37.6 };
export const EFFIS_WIDTH = 592;
export const EFFIS_HEIGHT = 535;

// The layer only answers WITHOUT a TIME parameter (dated requests return an
// empty image), so each fetch is the current run, stamped with the fetch date.
const EFFIS_URL =
  "https://ies-ows.jrc.ec.europa.eu/effis?service=WMS&version=1.1.1&request=GetMap" +
  `&layers=ecmwf007.fwi&srs=EPSG:4326` +
  `&bbox=${EFFIS_BBOX.west},${EFFIS_BBOX.south},${EFFIS_BBOX.east},${EFFIS_BBOX.north}` +
  `&width=${EFFIS_WIDTH}&height=${EFFIS_HEIGHT}&format=image/png`;

export function classifyPixel(
  r: number,
  g: number,
  b: number,
): EffisClass | null {
  for (const c of EFFIS_CLASSES)
    if (c.rgb[0] === r && c.rgb[1] === g && c.rgb[2] === b) return c.key;
  return null;
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

export async function ingestEffis(): Promise<EffisRun> {
  const res = await fetch(EFFIS_URL);
  if (!res.ok)
    return { communes: 0, classified: 0, error: `EFFIS WMS ${res.status}` };
  const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
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

  const date = new Date().toISOString().slice(0, 10);
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

  if (rows.length === 0)
    return {
      communes: communes.length,
      classified: 0,
      error: "EFFIS map matched no commune — palette or extent changed",
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
