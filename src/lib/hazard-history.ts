import { ONM_EVENTS } from "@/lib/civil-map-geometry";
import type { AdminUnit, FireCluster } from "@/lib/nadhir";

export type Hazard = "fire" | "weather" | "road";
export const HAZARDS: Hazard[] = ["fire", "weather", "road"];

export type OnmHistoryRow = {
  id: string;
  wilaya_id: string | null;
  event: string;
  severity: string;
  starts_at: string;
};

export type RoadHistoryRow = {
  id: string;
  area_id: string;
  published_at: string;
  summary: string;
};

export type HistoryRecord = {
  id: string;
  hazard: Hazard;
  at: string;
  wilayaId: string | null;
  fire?: { shortId: string; areaHa: number; state: string };
  weather?: { event: string; severity: string };
  road?: { summary: string };
};

const REAL_FIRE_STATES = new Set([
  "active",
  "unconfirmed",
  "contained_guess",
  "extinguished",
]);

export function fireRecords(clusters: FireCluster[]): HistoryRecord[] {
  return clusters
    .filter((c) => REAL_FIRE_STATES.has(c.state))
    .map((c) => ({
      id: c.id,
      hazard: "fire",
      at: c.first_detected_at,
      wilayaId: c.wilaya_id,
      fire: { shortId: c.short_id, areaHa: c.est_area_ha ?? 0, state: c.state },
    }));
}

export function weatherRecords(rows: OnmHistoryRow[]): HistoryRecord[] {
  return rows.map((w) => ({
    id: w.id,
    hazard: "weather",
    at: w.starts_at,
    wilayaId: w.wilaya_id,
    weather: { event: ONM_EVENTS[w.event] ?? "other", severity: w.severity },
  }));
}

export function roadRecords(
  rows: RoadHistoryRow[],
  units: AdminUnit[],
): HistoryRecord[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  return rows.map((r) => {
    const area = byId.get(r.area_id);
    return {
      id: r.id,
      hazard: "road",
      at: r.published_at,
      wilayaId: area
        ? area.level === "wilaya"
          ? area.id
          : area.parent_id
        : null,
      road: { summary: r.summary },
    };
  });
}

export function coverage(records: HistoryRecord[]) {
  const first: Partial<Record<Hazard, string>> = {};
  for (const r of records)
    if (!first[r.hazard] || r.at < first[r.hazard]!) first[r.hazard] = r.at;
  return first;
}

const DAY = 86_400_000;
const HOUR = 3_600_000;
// Algeria keeps UTC+1 all year; buckets follow the local calendar
const localDay = (iso: string) =>
  new Date(Date.parse(iso) + HOUR).toISOString().slice(0, 10);

function weekStart(day: string): string {
  const ms = Date.parse(`${day}T00:00:00Z`);
  const monday = (new Date(ms).getUTCDay() + 6) % 7;
  return new Date(ms - monday * DAY).toISOString().slice(0, 10);
}

export type Bucket = { start: string } & Record<Hazard, number> & {
    burnedHa: number;
  };

export function buckets(records: HistoryRecord[], nowMs: number) {
  const first = records.reduce<string | null>(
    (min, r) => (min === null || r.at < min ? r.at : min),
    null,
  );
  if (!first) return { granularity: "week" as const, rows: [] as Bucket[] };
  const weekly = nowMs - Date.parse(first) <= 120 * DAY;
  const keyOf = (iso: string) =>
    weekly ? weekStart(localDay(iso)) : `${localDay(iso).slice(0, 7)}-01`;

  const rows = new Map<string, Bucket>();
  let cursor = keyOf(first);
  const latest = records.reduce(
    (max, r) => (r.at > max ? r.at : max),
    new Date(nowMs).toISOString(),
  );
  const last = keyOf(latest);
  while (cursor <= last) {
    rows.set(cursor, {
      start: cursor,
      fire: 0,
      weather: 0,
      road: 0,
      burnedHa: 0,
    });
    const d = new Date(`${cursor}T00:00:00Z`);
    if (weekly) d.setUTCDate(d.getUTCDate() + 7);
    else d.setUTCMonth(d.getUTCMonth() + 1);
    cursor = d.toISOString().slice(0, 10);
  }
  for (const r of records) {
    const b = rows.get(keyOf(r.at));
    if (!b) continue;
    b[r.hazard] += 1;
    b.burnedHa += r.fire?.areaHa ?? 0;
  }
  return {
    granularity: weekly ? ("week" as const) : ("month" as const),
    rows: [...rows.values()],
  };
}

export type WilayaTally = {
  wilaya: AdminUnit;
  counts: Record<Hazard, number>;
  total: number;
  burnedHa: number;
};

export function wilayaRanking(
  records: HistoryRecord[],
  units: AdminUnit[],
  byBurnedArea: boolean,
) {
  const wilayas = new Map(
    units.filter((u) => u.level === "wilaya").map((u) => [u.id, u]),
  );
  const tallies = new Map<string, WilayaTally>();
  let unlocated = 0;
  for (const r of records) {
    const wilaya = r.wilayaId ? wilayas.get(r.wilayaId) : undefined;
    if (!wilaya) {
      unlocated += 1;
      continue;
    }
    const tally = tallies.get(wilaya.id) ?? {
      wilaya,
      counts: { fire: 0, weather: 0, road: 0 },
      total: 0,
      burnedHa: 0,
    };
    tally.counts[r.hazard] += 1;
    tally.total += 1;
    tally.burnedHa += r.fire?.areaHa ?? 0;
    tallies.set(wilaya.id, tally);
  }
  const ranked = [...tallies.values()]
    .sort((a, b) =>
      byBurnedArea ? b.burnedHa - a.burnedHa : b.total - a.total,
    )
    .slice(0, 10);
  return { ranked, unlocated };
}

// road summaries are third-party text; a leading = + - @ would run as a spreadsheet formula
const csvCell = (value: string | number) => {
  const raw = String(value);
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function historyCsv(
  records: HistoryRecord[],
  units: AdminUnit[],
): string {
  const names = new Map(units.map((u) => [u.id, u.name_fr]));
  const header = "hazard,id,started_at,wilaya,detail";
  const lines = records.map((r) =>
    [
      r.hazard,
      r.fire?.shortId ?? r.id,
      r.at,
      r.wilayaId ? (names.get(r.wilayaId) ?? "") : "",
      r.fire
        ? `${Math.round(r.fire.areaHa)} ha`
        : r.weather
          ? `${r.weather.severity} ${r.weather.event}`
          : (r.road?.summary ?? ""),
    ]
      .map(csvCell)
      .join(","),
  );
  return [header, ...lines].join("\n");
}
