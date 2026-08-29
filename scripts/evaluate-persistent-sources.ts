import { readFileSync, readdirSync } from "node:fs";

import { haversineKm } from "../src/lib/nadhir";
import { SCREEN_RADIUS_KM, cellKey, qualifies } from "../src/lib/persistent";

const CACHE = ".cache/firms-archive";
const SPLIT = "2024-01-01";
const MAX_REAL_LOSS = 0.06;
const MIN_FALSE_REMOVAL = 0.95;
const JOIN_KM = 3;
const JOIN_WINDOW_MS = 24 * 3600_000;
const ALERTING_DETECTIONS = 5;

const inBox = (la: number, lo: number) =>
  la >= 33.2 && la <= 37.6 && lo >= -3.2 && lo <= 9.7;

type Det = { lat: number; lon: number; type: string; ts: number };
const train = new Map<
  string,
  { static: number; fire: number; days: Set<string> }
>();
const test: Det[] = [];

for (const file of readdirSync(CACHE).sort()) {
  const lines = readFileSync(`${CACHE}/${file}`, "utf8").split("\n");
  const head = lines[0]!.split(",");
  const iLat = head.indexOf("latitude");
  const iLon = head.indexOf("longitude");
  const iType = head.indexOf("type");
  const iDate = head.indexOf("acq_date");
  const iTime = head.indexOf("acq_time");
  if (iType < 0) continue;
  for (const line of lines.slice(1)) {
    const p = line.split(",");
    if (p.length <= iType) continue;
    const lat = Number(p[iLat]);
    const lon = Number(p[iLon]);
    const type = p[iType]!;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || type === "3")
      continue;
    const date = p[iDate]!;
    if (date < SPLIT) {
      const k = cellKey(lat, lon).join(",");
      let acc = train.get(k);
      if (!acc) {
        acc = { static: 0, fire: 0, days: new Set() };
        train.set(k, acc);
      }
      if (type === "2") acc.static += 1;
      else if (type === "0") acc.fire += 1;
      acc.days.add(date);
    } else if (inBox(lat, lon)) {
      const t = Number(p[iTime]);
      const hh = String(Math.floor(t / 100)).padStart(2, "0");
      const mm = String(t % 100).padStart(2, "0");
      test.push({ lat, lon, type, ts: Date.parse(`${date}T${hh}:${mm}:00Z`) });
    }
  }
}

const registry: { lat: number; lon: number }[] = [];
for (const [k, a] of train) {
  const total = a.static + a.fire;
  if (!total) continue;
  if (
    !qualifies({
      staticShare: a.static / total,
      activeDays: a.days.size,
      detectionCount: total,
    })
  )
    continue;
  const [y, x] = k.split(",").map(Number) as [number, number];
  registry.push({ lat: y * 0.01, lon: x * 0.01 });
}

// Only cells near the test area can ever screen a test detection; skipping the
// rest turns a 60M-pair scan into a few million.
const local = registry.filter((c) => inBox(c.lat, c.lon));
const screened = (d: Det) =>
  local.some(
    (c) => haversineKm(d.lat, d.lon, c.lat, c.lon) <= SCREEN_RADIUS_KM,
  );

function alertingEvents(dets: Det[]): number {
  const sorted = [...dets].sort((a, b) => a.ts - b.ts);
  const open: { lat: number; lon: number; last: number; n: number }[] = [];
  for (const d of sorted) {
    let hit: (typeof open)[number] | undefined;
    for (let i = open.length - 1; i >= 0; i -= 1) {
      const e = open[i]!;
      if (d.ts - e.last > JOIN_WINDOW_MS) continue;
      if (haversineKm(e.lat, e.lon, d.lat, d.lon) <= JOIN_KM) {
        hit = e;
        break;
      }
    }
    if (hit) {
      hit.last = Math.max(hit.last, d.ts);
      hit.n += 1;
    } else open.push({ lat: d.lat, lon: d.lon, last: d.ts, n: 1 });
  }
  return open.filter((e) => e.n >= ALERTING_DETECTIONS).length;
}

const realBefore = alertingEvents(test.filter((d) => d.type === "0"));
const realAfter = alertingEvents(
  test.filter((d) => d.type === "0" && !screened(d)),
);
const falseBefore = alertingEvents(test.filter((d) => d.type === "2"));
const falseAfter = alertingEvents(
  test.filter((d) => d.type === "2" && !screened(d)),
);

const loss = (realBefore - realAfter) / realBefore;
const removal = (falseBefore - falseAfter) / falseBefore;
console.log(
  `registry ${registry.length} cells (${local.length} in ingest box)`,
);
console.log(
  `real  alerting-size events: ${realBefore} -> ${realAfter}  (loss ${(loss * 100).toFixed(1)}%)`,
);
console.log(
  `false alerting-size events: ${falseBefore} -> ${falseAfter}  (removal ${(removal * 100).toFixed(1)}%)`,
);

if (loss > MAX_REAL_LOSS) {
  console.error(
    `FAIL: real-event loss ${(loss * 100).toFixed(1)}% exceeds ${MAX_REAL_LOSS * 100}%`,
  );
  process.exit(1);
}
if (removal < MIN_FALSE_REMOVAL) {
  console.error(
    `FAIL: false-event removal ${(removal * 100).toFixed(1)}% below ${MIN_FALSE_REMOVAL * 100}%`,
  );
  process.exit(1);
}
console.log("PASS");
