import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { MIN_CONFIDENCE } from "../src/lib/alerts-rules";
import {
  REOPEN_WINDOW_HOURS,
  applyDailyLimit,
  coverageOf,
  fireSeverity,
  fuelLimitedCodes,
  insideCommunes,
  planFireBroadcast,
  pointInMultiPolygon,
  pushCodesFor,
  setThreadCoverage,
  targetCommunes,
  type CommuneShape,
  type OpenThread,
} from "../src/lib/broadcast-rules";
import { algiersToday } from "../src/lib/ingest/algiers-date";
import {
  MTG_FCI,
  parseWfsFireFeatures,
  type FciFeatureCollection,
} from "../src/lib/ingest/fci.server";
import { mapFirmsRows } from "../src/lib/ingest/firms.server";
import {
  PIXEL_GRID,
  estimateAreaHa,
  nearestFrom,
} from "../src/lib/ingest/fusion-geometry";
import {
  confidenceScore,
  stateFor,
  type Det,
} from "../src/lib/ingest/fusion.server";
import { isInAlgeriaNorth } from "../src/lib/ingest/geo";
import {
  nearestSource,
  type Source,
} from "../src/lib/ingest/persistent.server";
import { haversineKm } from "../src/lib/nadhir";

/* Offline replay of ingest → screen → fusion → broadcast planning over a past
 * window, against cached geography. Nothing here writes to a database. */

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2)
  args.set(process.argv[i]!.replace(/^--/, ""), process.argv[i + 1] ?? "");
const need = (k: string) => {
  const v = args.get(k);
  if (!v) throw new Error(`--${k} required`);
  return v;
};

const DATA = need("data");
const FROM = Date.parse(need("from"));
const THROUGH = Date.parse(need("through"));
const TAG = need("tag");
const OUT = args.get("out") ?? join(DATA, `out-${TAG}`);
const FOCUS = (args.get("focus") ?? "").split(",").filter(Boolean);

const TICK = 10 * 60_000;
const HOUR = 3600_000;
// measured in production 30 Aug–2 Sep: created_at − detected_at, p50 per sensor
const LAG_MIN: Record<string, number> = { FCI: 22, MODIS: 80 };
const VIIRS_LAG_MIN = 150;
const LIVE = ["active", "unconfirmed", "contained_guess"];
const JOIN_RADIUS_KM = 3;
const JOIN_WINDOW_H = 24;
const NEW_CLUSTER_RADIUS_KM = 2;
const MERGE_RADIUS_KM = 3;
const MAX_SETTLEMENT_DISTANCE_KM = 15;
const MAX_COMMUNE_DISTANCE_KM = 60;
const SHORTLIST_KM = 45;

type Row = Det & { available_at: number; fp: string | null };

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

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

function loadDetections(): Row[] {
  const rows: Row[] = [];
  const seen = new Set<string>();
  const fciDir = join(DATA, "fci");
  for (const file of readdirSync(fciDir).filter((f) => f.startsWith(TAG))) {
    const json = loadJson<FciFeatureCollection>(join(fciDir, file));
    for (const r of parseWfsFireFeatures(json, MTG_FCI).rows) {
      if (seen.has(r.natural_key)) continue;
      seen.add(r.natural_key);
      const detMs = Date.parse(r.detected_at);
      rows.push({
        id: r.natural_key,
        source: r.source,
        sensor: r.sensor,
        detected_at: r.detected_at,
        lat: r.lat,
        lon: r.lon,
        confidence_raw: r.confidence_raw,
        frp_mw: r.frp_mw,
        cluster_id: null,
        available_at: detMs + LAG_MIN["FCI"]! * 60_000,
        fp: null,
      });
    }
  }
  const firmsDir = join(DATA, "firms");
  if (existsSync(firmsDir)) {
    for (const file of readdirSync(firmsDir).filter((f) =>
      f.endsWith(".csv"),
    )) {
      const sensor = file
        .replace(/\.csv$/, "")
        .split("-")
        .pop()!;
      for (const r of mapFirmsRows(
        parseCsv(readFileSync(join(firmsDir, file), "utf8")),
        sensor,
      )) {
        if (seen.has(r.natural_key)) continue;
        seen.add(r.natural_key);
        const detMs = Date.parse(r.detected_at);
        rows.push({
          id: r.natural_key,
          source: r.source,
          sensor: r.sensor,
          detected_at: r.detected_at,
          lat: r.lat,
          lon: r.lon,
          confidence_raw: r.confidence_raw,
          frp_mw: r.frp_mw,
          cluster_id: null,
          available_at: detMs + (LAG_MIN[sensor] ?? VIIRS_LAG_MIN) * 60_000,
          fp: null,
        });
      }
    }
  }
  return rows
    .filter((r) => {
      const t = Date.parse(r.detected_at);
      return t >= FROM && t < THROUGH;
    })
    .sort((a, b) => a.available_at - b.available_at);
}

type Unit = {
  id: string;
  code: string;
  name_fr: string;
  level: string;
  parent_id: string | null;
  lat: number;
  lon: number;
  landcover: Parameters<typeof fuelLimitedCodes>[0][number]["landcover"];
};
type Settlement = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  commune_id: string | null;
};

const units = loadJson<Unit[]>(join(DATA, "units.json"));
const geoms = new Map(
  loadJson<{ id: string; geom: CommuneShape["geom"] }[]>(
    join(DATA, "geoms.json"),
  ).map((g) => [g.id, g.geom]),
);
const settlements = loadJson<Settlement[]>(join(DATA, "settlements.json"));
const unitById = new Map(units.map((u) => [u.id, u]));
const communes = units.filter((u) => u.level === "commune");
const shapes: (CommuneShape & { id: string })[] = communes.map((c) => ({
  id: c.id,
  code: c.code,
  lat: c.lat,
  lon: c.lon,
  geom: geoms.get(c.id) ?? null,
}));
const shapeByCode = new Map(shapes.map((s) => [s.code, s]));
const communeByCode = new Map(communes.map((c) => [c.code, c]));
const fuelLimited = fuelLimitedCodes(
  communes.map((c) => ({ code: c.code, landcover: c.landcover })),
);

const registry = loadJson<{ cells: Source[] }>(
  join(process.cwd(), "data/flares/algeria-persistent-sources.json"),
).cells;

type Cluster = {
  id: string;
  seq: number;
  state: string;
  lat: number;
  lon: number;
  first_detected_at: string;
  last_detected_at: string;
  dets: Row[];
  confidence: number;
  detection_count: number;
  max_frp_mw: number | null;
  nearest_settlement_id: string | null;
  nearest_settlement_km: number | null;
  commune_id: string | null;
  est_area_ha: number;
  first_active_at: string | null;
  first_confirmed_at: string | null;
  merged_into: string | null;
};

type Broadcast = {
  at: string;
  cluster: string;
  phase: "initial" | "update" | "end" | "cancel";
  severity: string;
  codes: string[];
  dropped: string[];
  detections: number;
  confidence: number;
  sources: string[];
  min_since_first: number;
  min_since_confirmed: number | null;
};

const all = loadDetections();
console.log(`detections in window: ${all.length}`);

let seq = 0;
const clusters = new Map<string, Cluster>();
const broadcasts: Broadcast[] = [];
const threads = new Map<string, OpenThread>();
const targetCache = new Map<string, string[]>();
const pending: Row[] = [];
let cursor = 0;
let screened = 0;
let silent = 0;
let capped = 0;

function within<T extends { lat: number; lon: number }>(
  list: T[],
  lat: number,
  lon: number,
  deg: number,
): T[] {
  return list.filter(
    (s) => Math.abs(s.lat - lat) <= deg && Math.abs(s.lon - lon) <= deg,
  );
}

function recompute(c: Cluster, now: number, geometry: boolean) {
  const list = c.dets;
  const times = list.map((d) => Date.parse(d.detected_at));
  const lastMs = Math.max(...times);
  c.state = stateFor(list, lastMs, now);
  if (c.state === "active" && !c.first_active_at)
    c.first_active_at = new Date(now).toISOString();
  if (
    c.state === "active" &&
    c.confidence >= MIN_CONFIDENCE &&
    !c.first_confirmed_at
  )
    c.first_confirmed_at = new Date(now).toISOString();
  if (!geometry) return;
  c.lat = list.reduce((s, d) => s + d.lat, 0) / list.length;
  c.lon = list.reduce((s, d) => s + d.lon, 0) / list.length;
  c.first_detected_at = new Date(Math.min(...times)).toISOString();
  c.last_detected_at = new Date(lastMs).toISOString();
  c.detection_count = list.length;
  c.max_frp_mw = Math.max(...list.map((d) => d.frp_mw ?? 0)) || null;
  c.confidence = confidenceScore(list);
  c.est_area_ha = estimateAreaHa(list);
  const nearSettle = nearestFrom(
    list,
    within(settlements, c.lat, c.lon, 0.3),
    MAX_SETTLEMENT_DISTANCE_KM,
  );
  c.nearest_settlement_id = nearSettle?.id ?? null;
  c.nearest_settlement_km = nearSettle
    ? Math.round(nearSettle.km * 10) / 10
    : null;
  const nearCommune =
    nearestFrom(
      list,
      within(communes, c.lat, c.lon, 0.8),
      MAX_COMMUNE_DISTANCE_KM,
    )?.id ?? null;
  c.commune_id = isInAlgeriaNorth(c.lat, c.lon) ? nearCommune : null;
  if (
    c.state === "active" &&
    c.confidence >= MIN_CONFIDENCE &&
    !c.first_confirmed_at
  )
    c.first_confirmed_at = new Date(now).toISOString();
}

function fuse(now: number) {
  const open = [...clusters.values()].filter(
    (c) => LIVE.includes(c.state) && !c.merged_into,
  );
  const fresh = pending.splice(0, pending.length);
  const touched = new Set<Cluster>();
  for (const det of fresh) {
    const detMs = Date.parse(det.detected_at);
    let target = open.find(
      (c) =>
        haversineKm(c.lat, c.lon, det.lat, det.lon) <= JOIN_RADIUS_KM &&
        Math.abs(detMs - Date.parse(c.last_detected_at)) <=
          JOIN_WINDOW_H * HOUR,
    );
    if (!target)
      target = open.find(
        (c) =>
          haversineKm(c.lat, c.lon, det.lat, det.lon) <= NEW_CLUSTER_RADIUS_KM,
      );
    if (!target) {
      seq += 1;
      target = {
        id: `C${String(seq).padStart(4, "0")}`,
        seq,
        state: "unconfirmed",
        lat: det.lat,
        lon: det.lon,
        first_detected_at: det.detected_at,
        last_detected_at: det.detected_at,
        dets: [],
        confidence: 0,
        detection_count: 0,
        max_frp_mw: null,
        nearest_settlement_id: null,
        nearest_settlement_km: null,
        commune_id: null,
        est_area_ha: 0,
        first_active_at: null,
        first_confirmed_at: null,
        merged_into: null,
      };
      clusters.set(target.id, target);
      open.push(target);
    }
    if (detMs > Date.parse(target.last_detected_at))
      target.last_detected_at = det.detected_at;
    target.dets.push(det);
    det.cluster_id = target.id;
    touched.add(target);
  }

  // merge pass, oldest cluster hosts
  const live = open
    .filter((c) => !c.merged_into)
    .sort((a, b) => a.first_detected_at.localeCompare(b.first_detected_at));
  const keepers: Cluster[] = [];
  for (const c of live) {
    const host = keepers.find(
      (k) => haversineKm(k.lat, k.lon, c.lat, c.lon) <= MERGE_RADIUS_KM,
    );
    if (!host) {
      keepers.push(c);
      continue;
    }
    for (const d of c.dets) d.cluster_id = host.id;
    host.dets.push(...c.dets);
    c.dets = [];
    c.merged_into = host.id;
    threads.delete(c.id);
    touched.add(host);
  }
  for (const c of keepers) if (c.dets.length) recompute(c, now, touched.has(c));
}

function targetsFor(c: Cluster): string[] {
  const key = `${c.id}:${c.lat.toFixed(2)}:${c.lon.toFixed(2)}`;
  const hit = targetCache.get(key);
  if (hit) return hit;
  const near = shapes.filter(
    (s) => haversineKm(s.lat, s.lon, c.lat, c.lon) <= SHORTLIST_KM,
  );
  const communeCode = c.commune_id
    ? (unitById.get(c.commune_id)?.code ?? null)
    : null;
  const codes = targetCommunes({ lat: c.lat, lon: c.lon, communeCode }, near);
  targetCache.set(key, codes);
  return codes;
}

function publish(now: number) {
  const today = algiersToday(new Date(now));
  const dayStart = Date.parse(`${today}T00:00:00+01:00`);
  const sentToday = new Map<string, number>();
  for (const b of broadcasts) {
    if (Date.parse(b.at) < dayStart) continue;
    if (b.phase !== "initial" && b.phase !== "update") continue;
    for (const code of b.codes)
      sentToday.set(code, (sentToday.get(code) ?? 0) + 1);
  }
  const reopenable = (t: OpenThread) =>
    t.phase === "initial" ||
    t.phase === "update" ||
    (t.phase === "end" && now - t.atMs < REOPEN_WINDOW_HOURS * HOUR);
  const candidates = [...clusters.values()].filter(
    (c) =>
      !c.merged_into &&
      ((c.state === "active" && c.confidence >= MIN_CONFIDENCE) ||
        (threads.has(c.id) && reopenable(threads.get(c.id)!))),
  );
  const coverage = coverageOf(threads);
  for (const c of candidates) {
    const open = threads.get(c.id) ?? null;
    const severity = fireSeverity(c.nearest_settlement_km, c.max_frp_mw);
    const targets = targetsFor(c);
    const seen = new Set<string>();
    const points = c.dets.filter((d) => {
      if (d.available_at <= now - 30 * 60_000) return false;
      const key = `${Math.round(d.lat / PIXEL_GRID)}:${Math.round(d.lon / PIXEL_GRID)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const inside = insideCommunes(points, targets, shapeByCode);
    const plan = planFireBroadcast({
      state: c.state,
      confidence: c.confidence,
      lastDetectedMs: Date.parse(c.last_detected_at),
      nowMs: now,
      severity,
      open,
      targets,
      additions: [],
      inside,
      fuelLimited,
    });
    if (!plan) continue;
    const closed = plan.action === "end" || plan.action === "cancel";
    const messageSeverity = closed ? (open?.severity ?? severity) : severity;
    const covered =
      plan.action === "initial" || plan.action === "update"
        ? plan.codes
        : (open?.communeCodes ?? []);
    const insideCodes =
      plan.action === "initial" || plan.action === "update"
        ? plan.inside
        : (open?.insideCodes ?? []);
    const rose = pushCodesFor({
      clusterId: c.id,
      action: plan.action,
      codes: covered,
      inside: insideCodes,
      previous: open,
      coverage,
    });
    const { allowed: pushed, dropped } = applyDailyLimit(
      rose,
      sentToday,
      closed || messageSeverity === "Extreme",
    );
    const thread: OpenThread = {
      phase: plan.action,
      severity: messageSeverity,
      communeCodes: covered,
      insideCodes,
      atMs: now,
    };
    threads.set(c.id, thread);
    setThreadCoverage(coverage, c.id, thread);
    capped += dropped.length;
    if (!pushed.length) {
      silent += 1;
      continue;
    }
    broadcasts.push({
      at: new Date(now).toISOString(),
      cluster: c.id,
      phase: plan.action,
      severity: messageSeverity,
      codes: pushed,
      dropped,
      detections: c.detection_count,
      confidence: c.confidence,
      sources: [...new Set(c.dets.map((d) => d.sensor))],
      min_since_first: Math.round(
        (now - Date.parse(c.first_detected_at)) / 60_000,
      ),
      min_since_confirmed: c.first_confirmed_at
        ? Math.round((now - Date.parse(c.first_confirmed_at)) / 60_000)
        : null,
    });
  }
}

const simEnd = THROUGH + 24 * HOUR;
for (let now = FROM; now <= simEnd; now += TICK) {
  if (now % (6 * HOUR) === 0)
    console.error(
      `${new Date(now).toISOString()} clusters ${clusters.size} broadcasts ${broadcasts.length}`,
    );
  while (cursor < all.length && all[cursor]!.available_at <= now) {
    const det = all[cursor]!;
    cursor += 1;
    const hit = nearestSource(det.lat, det.lon, registry);
    if (hit) {
      det.fp = `persistent_source:${hit.site_id}`;
      screened += 1;
      continue;
    }
    pending.push(det);
  }
  fuse(now);
  publish(now);
}

const finalClusters = [...clusters.values()].filter((c) => !c.merged_into);
const byPhase = new Map<string, number>();
for (const b of broadcasts)
  byPhase.set(
    `${b.phase}/${b.severity}`,
    (byPhase.get(`${b.phase}/${b.severity}`) ?? 0) + 1,
  );
const perCommune = new Map<string, number>();
for (const b of broadcasts)
  for (const code of b.codes)
    perCommune.set(code, (perCommune.get(code) ?? 0) + 1);
const initialsPerCluster = new Map<string, number>();
for (const b of broadcasts.filter((b) => b.phase === "initial"))
  initialsPerCluster.set(
    b.cluster,
    (initialsPerCluster.get(b.cluster) ?? 0) + 1,
  );

const name = (code: string) => {
  const c = communeByCode.get(code);
  const w = c?.parent_id ? unitById.get(c.parent_id) : null;
  return `${c?.name_fr ?? code} (${w?.name_fr ?? "?"})`;
};

const lines: string[] = [];
lines.push(
  `# Replay ${TAG}: ${new Date(FROM).toISOString()} → ${new Date(THROUGH).toISOString()}`,
);
lines.push(
  `detections ${all.length}, screened as persistent ${screened}, clusters ${finalClusters.length}`,
);
lines.push(
  `clusters ever active ${finalClusters.filter((c) => c.first_active_at).length}, ever broadcast-eligible ${finalClusters.filter((c) => c.first_confirmed_at).length}`,
);
lines.push("");
lines.push("## Broadcasts");
for (const [k, v] of [...byPhase.entries()].sort()) lines.push(`- ${k}: ${v}`);
lines.push(`- commune pushes dropped by the daily cap: ${capped}`);
lines.push(`- silent thread advances: ${silent}`);
lines.push(
  `- commune pushes all phases: ${broadcasts.reduce((s, b) => s + b.codes.length, 0)}`,
);
lines.push(`- distinct communes targeted: ${perCommune.size}`);
lines.push(
  `- initial pushes total across communes: ${broadcasts.filter((b) => b.phase === "initial").reduce((s, b) => s + b.codes.length, 0)}`,
);
lines.push(
  `- clusters with more than one initial: ${[...initialsPerCluster.values()].filter((n) => n > 1).length}`,
);
const ringSizes = broadcasts
  .filter((b) => b.phase === "initial")
  .map((b) => b.codes.length)
  .sort((a, b) => b - a);
lines.push(
  `- ring sizes (initial): max ${ringSizes[0] ?? 0}, median ${ringSizes[Math.floor(ringSizes.length / 2)] ?? 0}`,
);
lines.push("");
lines.push("## Most-pushed communes (all phases)");
for (const [code, n] of [...perCommune.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15))
  lines.push(`- ${name(code)}: ${n}`);
lines.push("");
lines.push("## Pushes per day per commune, top");
const perDay = new Map<string, number>();
for (const b of broadcasts)
  for (const code of b.codes) {
    const k = `${algiersToday(new Date(b.at))} ${code}`;
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
for (const [k, n] of [...perDay.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)) {
  const [day, code] = k.split(" ");
  lines.push(`- ${day} ${name(code!)}: ${n}`);
}
lines.push("");
lines.push("## Latency, first pixel → first initial broadcast (minutes)");
const lat = broadcasts
  .filter((b) => b.phase === "initial" && initialsPerCluster.get(b.cluster))
  .map((b) => b.min_since_first);
const firstInitial = new Map<string, Broadcast>();
for (const b of broadcasts)
  if (b.phase === "initial" && !firstInitial.has(b.cluster))
    firstInitial.set(b.cluster, b);
const firstLat = [...firstInitial.values()]
  .map((b) => b.min_since_first)
  .sort((a, b) => a - b);
const pct = (p: number) =>
  firstLat[Math.min(firstLat.length - 1, Math.floor(p * firstLat.length))] ??
  null;
lines.push(
  `- clusters with an initial: ${firstLat.length}; p10 ${pct(0.1)}, p50 ${pct(0.5)}, p90 ${pct(0.9)}, max ${firstLat.at(-1)} (n=${lat.length} initials)`,
);
lines.push("");

if (FOCUS.length) {
  lines.push("## Focus communes");
  lines.push(
    "commune | first pixel in polygon | first active cluster there | first live push after entry | pixel→push min | pushes",
  );
  for (const code of FOCUS) {
    const shape = shapeByCode.get(code);
    if (!shape) {
      lines.push(`${code} | not found`);
      continue;
    }
    const inside = all
      .filter((d) => !d.fp && pointInMultiPolygon(d.lat, d.lon, shape.geom))
      .sort((a, b) => a.detected_at.localeCompare(b.detected_at));
    const firstPixel = inside[0]?.detected_at ?? null;
    const activeThere =
      finalClusters
        .filter(
          (c) =>
            c.first_active_at &&
            c.dets.some((d) => pointInMultiPolygon(d.lat, d.lon, shape.geom)),
        )
        .map((c) => c.first_active_at!)
        .sort()[0] ?? null;
    const push = broadcasts
      .filter(
        (b) =>
          (b.phase === "initial" || b.phase === "update") &&
          b.codes.includes(code) &&
          (!firstPixel || b.at >= firstPixel),
      )
      .sort((a, b) => a.at.localeCompare(b.at))[0];
    const delta =
      firstPixel && push
        ? Math.round((Date.parse(push.at) - Date.parse(firstPixel)) / 60_000)
        : null;
    lines.push(
      `${name(code)} | ${firstPixel ?? "—"} | ${activeThere ?? "—"} | ${push?.at ?? "—"} | ${delta ?? "—"} | ${perCommune.get(code) ?? 0}`,
    );
  }
  lines.push("");
}

lines.push("## Hourly, whole window");
const hourly = new Map<
  string,
  { dets: number; initials: number; ends: number; pushes: number }
>();
const hk = (iso: string) => iso.slice(0, 13);
for (const d of all)
  if (!d.fp) {
    const h = hourly.get(hk(d.detected_at)) ?? {
      dets: 0,
      initials: 0,
      ends: 0,
      pushes: 0,
    };
    h.dets += 1;
    hourly.set(hk(d.detected_at), h);
  }
for (const b of broadcasts) {
  const h = hourly.get(hk(b.at)) ?? {
    dets: 0,
    initials: 0,
    ends: 0,
    pushes: 0,
  };
  if (b.phase === "initial") h.initials += 1;
  if (b.phase === "end") h.ends += 1;
  h.pushes += b.codes.length;
  hourly.set(hk(b.at), h);
}
for (const [h, v] of [...hourly.entries()].sort())
  lines.push(
    `${h} dets ${v.dets} initials ${v.initials} ends ${v.ends} commune-pushes ${v.pushes}`,
  );

writeFileSync(join(OUT + ".md"), lines.join("\n"));
writeFileSync(
  join(OUT + ".json"),
  JSON.stringify(
    {
      broadcasts,
      clusters: finalClusters.map((c) => ({
        ...c,
        dets: undefined,
        commune: c.commune_id ? unitById.get(c.commune_id)?.name_fr : null,
        sensors: [...new Set(c.dets.map((d) => d.sensor))],
      })),
    },
    null,
    1,
  ),
);
console.log(lines.slice(0, 40).join("\n"));
console.log(`\nwritten ${OUT}.md and .json`);
