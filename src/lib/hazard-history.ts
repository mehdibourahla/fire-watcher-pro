import {
  infiniteQueryOptions,
  queryOptions,
  type InfiniteData,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { ONM_EVENTS } from "@/lib/civil-map-geometry";
import type { AdminUnit } from "@/lib/nadhir";
import { fetchAllPages } from "@/lib/paginate";
import { PAGE_SIZE, firstPage, nextOffset, pageRange } from "@/lib/paging";
import { FIRE_KINDS } from "@/lib/text-sources/merge";

export type Hazard = "fire" | "weather" | "road";
export const HAZARDS: Hazard[] = ["fire", "weather", "road"];

export type HistoryRecord = {
  id: string;
  hazard: Hazard;
  at: string;
  wilayaId: string | null;
  fire?: { shortId: string; areaHa: number; state: string };
  weather?: { event: string; severity: string };
  road?: { summary: string };
};

export type Bucket = { start: string } & Record<Hazard, number> & {
    burnedHa: number;
  };

export type HistoryFilters = {
  hazard: Hazard | null;
  wilayaId: string | null;
  year: number | null;
};

export type HistorySummary = {
  total: number;
  fires: number;
  burnedHa: number;
  granularity: "week" | "month";
  buckets: Bucket[];
  ranking: ({ wilayaId: string; total: number; burnedHa: number } & Record<
    Hazard,
    number
  >)[];
  unlocated: number;
  events: Record<string, number>;
  severities: Record<string, number>;
  coverage: Partial<Record<Hazard, string>>;
  years: number[];
  official: number;
};

type HistoryRow = Database["public"]["Views"]["hazard_history"]["Row"];

const COLUMNS =
  "id, hazard, at, wilaya_id, short_id, area_ha, state, event, severity, summary";

export function historyRecord(row: HistoryRow): HistoryRecord {
  const base = {
    id: row.id!,
    hazard: row.hazard as Hazard,
    at: row.at!,
    wilayaId: row.wilaya_id,
  };
  if (row.hazard === "fire")
    return {
      ...base,
      fire: {
        shortId: row.short_id ?? "",
        areaHa: row.area_ha ?? 0,
        state: row.state ?? "",
      },
    };
  if (row.hazard === "weather")
    return {
      ...base,
      weather: {
        event: ONM_EVENTS[row.event ?? ""] ?? "other",
        severity: row.severity ?? "",
      },
    };
  return { ...base, road: { summary: row.summary ?? "" } };
}

function filtered(filters: HistoryFilters) {
  let query = supabase.from("hazard_history").select(COLUMNS);
  if (filters.hazard) query = query.eq("hazard", filters.hazard);
  if (filters.wilayaId) query = query.eq("wilaya_id", filters.wilayaId);
  if (filters.year)
    query = query
      .gte("at", `${filters.year}-01-01T00:00:00Z`)
      .lt("at", `${filters.year + 1}-01-01T00:00:00Z`);
  return query.order("at", { ascending: false }).order("id");
}

export const historyRecordsQuery = (filters: HistoryFilters) =>
  infiniteQueryOptions({
    queryKey: ["history", "records", filters],
    initialPageParam: firstPage,
    getNextPageParam: nextOffset,
    select: (data: InfiniteData<HistoryRow[]>) =>
      data.pages.flat().map((row) => historyRecord(row)),
    queryFn: async ({ pageParam }): Promise<HistoryRow[]> => {
      const { data, error } = await filtered(filters).range(
        ...pageRange(pageParam),
      );
      if (error) throw new Error(error.message);
      return data;
    },
  });

export const recentRoadsQuery = (filters: HistoryFilters) =>
  queryOptions({
    queryKey: ["history", "roads", filters],
    queryFn: async () => {
      const { data, error } = await filtered({
        ...filters,
        hazard: "road",
      }).limit(5);
      if (error) throw new Error(error.message);
      return data.map(historyRecord);
    },
  });

export const historySummaryQuery = (filters: HistoryFilters) =>
  queryOptions({
    queryKey: ["history", "summary", filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("hazard_history_summary", {
        ...(filters.hazard ? { _hazard: filters.hazard } : {}),
        ...(filters.wilayaId ? { _wilaya: filters.wilayaId } : {}),
        ...(filters.year ? { _year: filters.year } : {}),
        _official_kinds: [...FIRE_KINDS],
      });
      if (error) throw new Error(error.message);
      return data as unknown as HistorySummary;
    },
  });

export async function allHistoryRecords(filters: HistoryFilters) {
  const rows = await fetchAllPages<HistoryRow>((from, to) =>
    filtered(filters).range(from, to),
  );
  return rows.map(historyRecord);
}

export const historyPageSize = PAGE_SIZE;

// road summaries are third-party text; a leading = + - @ tab or CR would run as a spreadsheet formula
const csvCell = (value: string | number) => {
  const raw = String(value);
  const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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
