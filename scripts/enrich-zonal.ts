import { createClient } from "@supabase/supabase-js";
import { fromUrl, type GeoTIFF } from "geotiff";

import { fetchCommunePolygons } from "./overpass-communes";
import {
  bboxOf,
  landcoverFractions,
  rasterizeMask,
  sampleGrid,
  slopeStats,
  type MultiPolygon,
  type Point,
  type SlopeStats,
} from "../src/lib/zonal";

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (
  !url.startsWith("https://") &&
  !/^http:\/\/(localhost|127\.0\.0\.1)/.test(url)
) {
  console.error(
    "SUPABASE_URL must be https:// (or localhost for development).",
  );
  process.exit(1);
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const WC_BASE =
  "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map";
const DEM_BASE = "https://copernicus-dem-30m.s3.amazonaws.com";
const LC_SAMPLES = 2048;
const DEM_MAX_PX = 360;
const METERS_PER_DEG = 111320;

const pad = (v: number, w: number) => String(Math.abs(v)).padStart(w, "0");
const latTag = (lat: number, w: number) =>
  `${lat < 0 ? "S" : "N"}${pad(lat, w)}`;
const lonTag = (lon: number, w: number) =>
  `${lon < 0 ? "W" : "E"}${pad(lon, w)}`;

const wcTileUrl = (lat: number, lon: number) => {
  const la = Math.floor(lat / 3) * 3;
  const lo = Math.floor(lon / 3) * 3;
  return `${WC_BASE}/ESA_WorldCover_10m_2021_v200_${latTag(la, 2)}${lonTag(lo, 3)}_Map.tif`;
};
const demTileUrl = (lat: number, lon: number) => {
  const name = `Copernicus_DSM_COG_10_${latTag(Math.floor(lat), 2)}_00_${lonTag(Math.floor(lon), 3)}_00_DEM`;
  return `${DEM_BASE}/${name}/${name}.tif`;
};

const tiffs = new Map<string, Promise<GeoTIFF | null>>();
const openTiff = (tileUrl: string) => {
  let t = tiffs.get(tileUrl);
  if (!t) {
    t = fromUrl(tileUrl).catch(() => null);
    tiffs.set(tileUrl, t);
  }
  return t;
};

type Window = { west: number; south: number; east: number; north: number };

const READ_TIMEOUT_MS = 60_000;

const withTimeout = <T>(p: Promise<T>): Promise<T | null> =>
  Promise.race([
    p,
    new Promise<null>((r) => setTimeout(() => r(null), READ_TIMEOUT_MS)),
  ]).catch(() => null);

async function readWindow(tileUrl: string, win: Window, maxPx: number) {
  const tiff = await withTimeout(openTiff(tileUrl));
  if (!tiff) return null;
  const full = await tiff.getImage(0);
  const [tw, ts, te, tn] = full.getBoundingBox() as [
    number,
    number,
    number,
    number,
  ];
  const west = Math.max(win.west, tw);
  const south = Math.max(win.south, ts);
  const east = Math.min(win.east, te);
  const north = Math.min(win.north, tn);
  if (west >= east || south >= north) return null;

  const count = await tiff.getImageCount();
  let image = full;
  // overview bboxes can lack geo keys; pixel scale derives from the full image
  for (let i = count - 1; i >= 0; i -= 1) {
    const img = await tiff.getImage(i);
    const degPerPx = (te - tw) / img.getWidth();
    const w = (east - west) / degPerPx;
    const h = (north - south) / degPerPx;
    if (w <= maxPx && h <= maxPx) {
      image = img;
      break;
    }
  }
  const degPerPxX = (te - tw) / image.getWidth();
  const degPerPxY = (tn - ts) / image.getHeight();
  const x0 = Math.max(0, Math.floor((west - tw) / degPerPxX));
  const y0 = Math.max(0, Math.floor((tn - north) / degPerPxY));
  const x1 = Math.min(image.getWidth(), Math.ceil((east - tw) / degPerPxX));
  const y1 = Math.min(image.getHeight(), Math.ceil((tn - south) / degPerPxY));
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  const data = (await withTimeout(
    image.readRasters({ window: [x0, y0, x1, y1] }),
  )) as unknown as {
    0: ArrayLike<number>;
    width: number;
    height: number;
  } | null;
  if (!data) return null;
  return {
    values: data[0],
    width: data.width,
    height: data.height,
    west: tw + x0 * degPerPxX,
    north: tn - y0 * degPerPxY,
    degPerPxX,
    degPerPxY,
  };
}

async function landcoverFor(mp: MultiPolygon) {
  const pts = sampleGrid(mp, LC_SAMPLES);
  if (!pts.length) return null;
  const byTile = new Map<string, Point[]>();
  for (const p of pts) {
    const t = wcTileUrl(p[1], p[0]);
    const bucket = byTile.get(t);
    if (bucket) bucket.push(p);
    else byTile.set(t, [p]);
  }
  const values: number[] = [];
  for (const [tileUrl, tilePts] of byTile) {
    const box = {
      west: Math.min(...tilePts.map((p) => p[0])),
      south: Math.min(...tilePts.map((p) => p[1])),
      east: Math.max(...tilePts.map((p) => p[0])) + 1e-6,
      north: Math.max(...tilePts.map((p) => p[1])) + 1e-6,
    };
    const w = await readWindow(tileUrl, box, 1024);
    if (!w) continue;
    for (const [lon, lat] of tilePts) {
      const x = Math.min(w.width - 1, Math.floor((lon - w.west) / w.degPerPxX));
      const y = Math.min(
        w.height - 1,
        Math.floor((w.north - lat) / w.degPerPxY),
      );
      values.push(Number(w.values[y * w.width + x]));
    }
  }
  return landcoverFractions(values);
}

async function terrainFor(mp: MultiPolygon) {
  const box = bboxOf(mp);
  const parts: SlopeStats[] = [];
  const tiles =
    (Math.floor(box.north) - Math.floor(box.south) + 1) *
    (Math.floor(box.east) - Math.floor(box.west) + 1);
  // one cell budget per commune, however many 1-degree tiles its bbox spans
  const maxPx = Math.max(64, Math.floor(DEM_MAX_PX / Math.sqrt(tiles)));
  for (let la = Math.floor(box.south); la <= Math.floor(box.north); la += 1)
    for (let lo = Math.floor(box.west); lo <= Math.floor(box.east); lo += 1) {
      const w = await readWindow(demTileUrl(la + 0.5, lo + 0.5), box, maxPx);
      if (!w) continue;
      const mask = rasterizeMask(
        mp,
        w.west,
        w.north,
        w.degPerPxX,
        w.degPerPxY,
        w.width,
        w.height,
      );
      const elev: number[][] = [];
      for (let r = 0; r < w.height; r += 1) {
        const er: number[] = [];
        for (let c = 0; c < w.width; c += 1)
          er.push(Number(w.values[r * w.width + c]));
        elev.push(er);
      }
      const latMid = w.north - (w.height / 2) * w.degPerPxY;
      const s = slopeStats(
        elev,
        w.degPerPxX * METERS_PER_DEG * Math.cos((latMid * Math.PI) / 180),
        w.degPerPxY * METERS_PER_DEG,
        mask,
      );
      if (s) parts.push(s);
    }
  if (!parts.length) return null;
  const total = parts.reduce((a, p) => a + p.cells, 0);
  // p90 pooled as a cell-weighted mean of per-tile p90s: approximate, and only
  // for the few communes that cross a 1° tile edge
  const wavg = (f: (p: SlopeStats) => number) =>
    parts.reduce((a, p) => a + f(p) * p.cells, 0) / total;
  return {
    mean_slope_deg: wavg((p) => p.mean_slope_deg),
    p90_slope_deg: wavg((p) => p.p90_slope_deg),
    pct_above_20_deg: wavg((p) => p.pct_above_20_deg),
    south_facing_pct: wavg((p) => p.south_facing_pct),
  };
}

// polygons come straight from Overpass so the backfill does not depend on
// admin_units.geom being populated (kept empty until the select(*) fix ships)
const { polygons } = await fetchCommunePolygons();
const byCode = new Map(polygons.map((p) => [p.code, p.coordinates]));
const communes: { id: string; code: string }[] = [];
for (let page = 0; ; page += 1) {
  const { data, error } = await db
    .from("admin_units")
    .select("id, code")
    .eq("level", "commune")
    .order("id")
    .range(page * 1000, page * 1000 + 999);
  if (error) throw new Error(error.message);
  communes.push(...((data ?? []) as typeof communes));
  if ((data ?? []).length < 1000) break;
}

const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;
const CONCURRENCY = 6;
let done = 0;
let skipped = 0;

async function enrichOne(c: (typeof communes)[number]) {
  const mp = byCode.get(c.code);
  if (!mp) {
    skipped += 1;
    return;
  }
  const t0 = Date.now();
  const lc = await landcoverFor(mp);
  const tr = await terrainFor(mp);
  if (Date.now() - t0 > 20_000)
    console.log(
      `slow commune ${c.code}: ${Math.round((Date.now() - t0) / 1000)}s`,
    );
  if (!lc && !tr) {
    skipped += 1;
    return;
  }
  const patch: Record<string, unknown> = {};
  if (lc) {
    patch["landcover"] = Object.fromEntries(
      Object.entries(lc).map(([k, v]) => [k, round(v, 3)]),
    );
    patch["forest_fraction"] = round(lc.tree, 3);
  }
  if (tr)
    patch["terrain"] = Object.fromEntries(
      Object.entries(tr).map(([k, v]) => [k, round(v, 1)]),
    );
  const { error } = await db.from("admin_units").update(patch).eq("id", c.id);
  if (error) throw new Error(`update failed for ${c.code}: ${error.message}`);
  done += 1;
  if (done % 100 === 0) console.log(`${done} communes enriched`);
}

for (let i = 0; i < communes.length; i += CONCURRENCY)
  await Promise.all(communes.slice(i, i + CONCURRENCY).map(enrichOne));

console.log(`Enriched ${done} communes, skipped ${skipped}`);
