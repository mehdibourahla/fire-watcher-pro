import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
  MIN_ACTIVE_DAYS,
  MIN_DETECTIONS,
  MIN_STATIC_SHARE,
  cellCentre,
  cellKey,
  qualifies,
  siteIdFor,
} from "../src/lib/persistent";

const key = process.env["FIRMS_MAP_KEY"];
if (!key) {
  console.error(
    "Set FIRMS_MAP_KEY. The registry is derived from the FIRMS science-processed archive.",
  );
  process.exit(1);
}

const SOURCE = "VIIRS_SNPP_SP";
const BBOX = "-9,18,12,38";
const START_YEAR = 2016;
const END_YEAR = 2025;
const CACHE = ".cache/firms-archive";
const OUT = "data/flares/algeria-persistent-sources.json";

mkdirSync(CACHE, { recursive: true });
mkdirSync("data/flares", { recursive: true });

function* windows() {
  for (let y = START_YEAR; y <= END_YEAR; y += 1) {
    for (
      let d = new Date(Date.UTC(y, 0, 1));
      d.getUTCFullYear() === y;
      d.setUTCDate(d.getUTCDate() + 5)
    ) {
      yield d.toISOString().slice(0, 10);
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The deployed ingest shares this MAP_KEY and runs every 10 minutes. FIRMS meters
// 5000 transactions per 10 minutes per key, so this backfill paces itself well
// under that ceiling rather than starving live detection of its quota.
const REQUEST_SPACING_MS = 2000;
let lastRequestAt = 0;
async function throttle() {
  const wait = lastRequestAt + REQUEST_SPACING_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function fetchWindow(day: string): Promise<string> {
  const path = `${CACHE}/${day}.csv`;
  if (existsSync(path)) return readFileSync(path, "utf8");
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${SOURCE}/${BBOX}/5/${day}`;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await throttle();
    const res = await fetch(url);
    const body = await res.text();
    if (res.ok && body.startsWith("latitude")) {
      writeFileSync(path, body);
      return body;
    }
    // FIRMS answers 200 with a plain-text refusal when the quota is spent, and
    // reports a valid key as invalid once hard-throttled. Both must be waited out.
    if (
      body.includes("Exceeding allowed transaction limit") ||
      body.includes("Invalid MAP_KEY")
    ) {
      console.log(`  throttled, waiting 120s (${day}): ${body.trim()}`);
      await sleep(120_000);
      continue;
    }
    await sleep(3000 * (attempt + 1));
  }
  throw new Error(`FIRMS window ${day} failed after 20 attempts`);
}

type Acc = {
  static: number;
  fire: number;
  days: Set<string>;
  frp: number[];
  julAug: number;
};
const cells = new Map<string, Acc>();
const observationDays = new Set<string>();
// A 5-day window opened on 31 December spans into the next year, which that year's
// first window also covers, so the same detection arrives twice in leap years.
const seen = new Set<string>();

const all = [...windows()];
for (const [i, day] of all.entries()) {
  const csv = await fetchWindow(day);
  const lines = csv.split("\n");
  const head = lines[0]!.split(",");
  const iLat = head.indexOf("latitude");
  const iLon = head.indexOf("longitude");
  const iType = head.indexOf("type");
  const iDate = head.indexOf("acq_date");
  const iFrp = head.indexOf("frp");
  const iTime = head.indexOf("acq_time");
  if (iType < 0)
    throw new Error(`${day}: archive returned no 'type' column; wrong product`);
  for (const line of lines.slice(1)) {
    const p = line.split(",");
    if (p.length <= iType) continue;
    const lat = Number(p[iLat]);
    const lon = Number(p[iLon]);
    const type = p[iType];
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || type === "3")
      continue;
    const date = p[iDate]!;
    const uid = `${p[iLat]},${p[iLon]},${date},${p[iTime]}`;
    if (seen.has(uid)) continue;
    seen.add(uid);
    observationDays.add(date);
    const k = cellKey(lat, lon).join(",");
    let acc = cells.get(k);
    if (!acc) {
      acc = { static: 0, fire: 0, days: new Set(), frp: [], julAug: 0 };
      cells.set(k, acc);
    }
    if (type === "2") acc.static += 1;
    else if (type === "0") acc.fire += 1;
    acc.days.add(date);
    const frp = Number(p[iFrp]);
    if (Number.isFinite(frp)) acc.frp.push(frp);
    const month = date.slice(5, 7);
    if (month === "07" || month === "08") acc.julAug += 1;
  }
  if (i % 25 === 0) console.log(`  ${i}/${all.length} windows`);
}

const pct = (a: number[], q: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))]! : 0;
};

const qualified: { key: [number, number]; acc: Acc; total: number }[] = [];
for (const [k, acc] of cells) {
  const total = acc.static + acc.fire;
  if (total === 0) continue;
  if (
    !qualifies({
      staticShare: acc.static / total,
      activeDays: acc.days.size,
      detectionCount: total,
    })
  )
    continue;
  qualified.push({
    key: k.split(",").map(Number) as [number, number],
    acc,
    total,
  });
}

// A refinery spans several cells; group adjacent ones so the map shows one site
// rather than a cloud of markers. Cells stay the screening unit.
const parent = new Map<string, string>();
const find = (a: string): string => {
  const p = parent.get(a);
  if (!p || p === a) return a;
  const root = find(p);
  parent.set(a, root);
  return root;
};
const union = (a: string, b: string) => {
  const [ra, rb] = [find(a), find(b)];
  if (ra !== rb) parent.set(ra, rb);
};
for (const q of qualified) parent.set(q.key.join(","), q.key.join(","));
for (const a of qualified) {
  for (const b of qualified) {
    if (a === b) continue;
    if (
      Math.abs(a.key[0] - b.key[0]) <= 2 &&
      Math.abs(a.key[1] - b.key[1]) <= 2
    ) {
      union(a.key.join(","), b.key.join(","));
    }
  }
}
const strongest = new Map<string, { key: [number, number]; total: number }>();
for (const q of qualified) {
  const root = find(q.key.join(","));
  const cur = strongest.get(root);
  if (!cur || q.total > cur.total)
    strongest.set(root, { key: q.key, total: q.total });
}

const out = qualified.map((q) => {
  const days = [...q.acc.days].sort();
  const root = find(q.key.join(","));
  return {
    ...cellCentre(q.key),
    site_id: siteIdFor(strongest.get(root)!.key),
    static_share: Number((q.acc.static / q.total).toFixed(4)),
    active_days: q.acc.days.size,
    detection_count: q.total,
    first_seen: days[0]!,
    last_seen: days[days.length - 1]!,
    frp_p50: Number(pct(q.acc.frp, 0.5).toFixed(2)),
    frp_p90: Number(pct(q.acc.frp, 0.9).toFixed(2)),
    jul_aug_share: Number((q.acc.julAug / q.total).toFixed(4)),
  };
});
out.sort((a, b) => b.detection_count - a.detection_count);
console.log(
  `grouped ${out.length} cells into ${new Set(out.map((c) => c.site_id)).size} sites`,
);

writeFileSync(
  OUT,
  JSON.stringify(
    {
      source: `NASA FIRMS ${SOURCE}`,
      built: new Date().toISOString().slice(0, 10),
      window: { start: `${START_YEAR}-01-01`, end: `${END_YEAR}-12-31` },
      observation_days: observationDays.size,
      criteria: {
        min_static_share: MIN_STATIC_SHARE,
        min_active_days: MIN_ACTIVE_DAYS,
        min_detections: MIN_DETECTIONS,
      },
      cells: out,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `wrote ${out.length} cells to ${OUT} over ${observationDays.size} observation days`,
);
