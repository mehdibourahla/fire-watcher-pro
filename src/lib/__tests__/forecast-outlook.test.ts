import { describe, expect, it } from "vitest";

import {
  airCells,
  algiersDate,
  defaultCommune,
  fireCells,
  nationalRanking,
  onmCells,
  outlookDays,
  weatherCells,
} from "@/lib/forecast-outlook";
import type { AdminUnit, OnmVigilance, RiskForecast } from "@/lib/nadhir";

const DAYS = [
  "2026-09-25",
  "2026-09-26",
  "2026-09-27",
  "2026-09-28",
  "2026-09-29",
  "2026-09-30",
];

const warning = (o: Partial<OnmVigilance> = {}): OnmVigilance => ({
  id: "w1",
  cap_id: "cap1",
  title: "t",
  event: "Thunderstorm",
  severity: "Moderate",
  urgency: "Expected",
  certainty: "Likely",
  onset: "2026-09-25T12:00:00Z",
  expires: "2026-09-25T20:00:00Z",
  sent: "2026-09-24T18:00:00Z",
  area_desc: "Batna",
  cap_url: null,
  wilaya_id: "w-batna",
  headline_fr: null,
  superseded_at: null,
  ...o,
});

const forecast = (o: Partial<RiskForecast> = {}): RiskForecast => ({
  id: "f1",
  commune_id: "c1",
  forecast_date: "2026-09-25",
  horizon_days: 0,
  source: "local_fwi",
  fwi: 30,
  fwi_percentile: 80,
  danger_level: 3,
  fuel_limited: false,
  snapshot_id: "s1",
  ...o,
});

const unit = (o: Partial<AdminUnit>): AdminUnit => ({
  id: "x",
  level: "commune",
  code: "0",
  name_ar: "",
  name_fr: "",
  name_en: "",
  name_kab: null,
  parent_id: null,
  lat: 0,
  lon: 0,
  forest_fraction: 0,
  population: null,
  ...o,
});

describe("outlook days", () => {
  it("starts on the Algiers date, which is ahead of UTC late in the evening", () => {
    const lateUtc = Date.parse("2026-09-24T23:30:00Z");
    expect(algiersDate(lateUtc)).toBe("2026-09-25");
    expect(outlookDays(lateUtc)).toEqual(DAYS);
  });
});

describe("ONM cells", () => {
  it("says nothing was issued beyond tomorrow instead of claiming no warning", () => {
    const cells = onmCells([], "w-batna", DAYS);
    expect(cells.slice(0, 2)).toEqual([{ state: "none" }, { state: "none" }]);
    expect(cells.slice(2).every((c) => c.state === "not_issued")).toBe(true);
  });

  it("counts a re-issued warning once and takes the highest severity", () => {
    const cells = onmCells(
      [
        warning({ id: "a" }),
        warning({ id: "b", sent: "2026-09-24T19:00:00Z" }),
        warning({ id: "c", event: "Rain", severity: "Severe" }),
      ],
      "w-batna",
      DAYS,
    );
    expect(cells[0]).toEqual({
      state: "warning",
      level: 3,
      events: ["storm", "rain"],
    });
    expect(cells[1]).toEqual({ state: "none" });
  });

  it("shows a long warning on the later days it covers", () => {
    const cells = onmCells(
      [warning({ expires: "2026-09-27T12:00:00Z" })],
      "w-batna",
      DAYS,
    );
    expect(cells[2]).toMatchObject({ state: "warning", level: 2 });
    expect(cells[3]).toEqual({ state: "not_issued" });
  });

  it("ignores other wilayas", () => {
    expect(onmCells([warning()], "w-other", DAYS)[0]).toEqual({
      state: "none",
    });
  });
});

describe("fire and weather cells", () => {
  it("matches rows by date, not horizon, so a late publication stays aligned", () => {
    const rows = [
      forecast({
        forecast_date: "2026-09-26",
        horizon_days: 2,
        danger_level: 5,
        components: { temp_c: 31, wind_kmh: 22, rain_mm: 0 },
      }),
    ];
    expect(fireCells(rows, DAYS)[0]).toBeNull();
    expect(fireCells(rows, DAYS)[1]).toMatchObject({ level: 5 });
    expect(weatherCells(rows, DAYS)[1]).toEqual({
      tempC: 31,
      windKmh: 22,
      rainMm: 0,
    });
    expect(weatherCells([forecast({ components: null })], DAYS)[0]).toBeNull();
  });
});

describe("air cells", () => {
  const hours = (day: string, n: number, pm25: number, pm10: number) => ({
    time: Array.from(
      { length: n },
      (_, h) => `${day}T${String(h).padStart(2, "0")}:00`,
    ),
    pm2_5: Array(n).fill(pm25),
    pm10: Array(n).fill(pm10),
  });

  it("rates a full day by its 24 h means and names the pollutant that set the level", () => {
    const cells = airCells(hours("2026-09-25", 24, 10, 90), DAYS);
    expect(cells[0]).toEqual({
      state: "ok",
      level: "high",
      pollutant: "pm10",
      pm25: 10,
      pm10: 90,
    });
  });

  it("refuses a day with fewer than 24 model hours", () => {
    const partial = hours("2026-09-25", 23, 10, 10);
    const withGap = hours("2026-09-26", 24, 10, 10);
    withGap.pm10[5] = null as unknown as number;
    const cells = airCells(
      {
        time: [...partial.time, ...withGap.time],
        pm2_5: [...partial.pm2_5, ...withGap.pm2_5],
        pm10: [...partial.pm10, ...withGap.pm10],
      },
      DAYS,
    );
    expect(cells[0]).toEqual({ state: "beyond" });
    expect(cells[1]).toEqual({ state: "beyond" });
  });
});

describe("national ranking", () => {
  const units = [
    unit({ id: "w-batna", level: "wilaya", code: "05" }),
    unit({ id: "w-tizi", level: "wilaya", code: "15" }),
    unit({ id: "w-oran", level: "wilaya", code: "31" }),
    unit({ id: "c-batna", parent_id: "w-batna", population: 300 }),
    unit({ id: "c-tizi-a", parent_id: "w-tizi", population: 100 }),
    unit({ id: "c-tizi-b", parent_id: "w-tizi", population: 900 }),
    unit({ id: "c-oran", parent_id: "w-oran", population: 800 }),
  ];

  it("ranks wilayas by their worst hazard and points each at a commune", () => {
    const rows = nationalRanking(
      units,
      [
        forecast({ commune_id: "c-tizi-a", danger_level: 5 }),
        forecast({
          commune_id: "c-tizi-b",
          danger_level: 5,
          fuel_limited: true,
        }),
        forecast({ commune_id: "c-oran", danger_level: 2 }),
      ],
      [warning({ severity: "Severe" })],
      DAYS,
    );
    expect(rows.map((r) => [r.wilaya.id, r.level, r.targetCommuneId])).toEqual([
      ["w-tizi", 5, "c-tizi-a"],
      ["w-batna", 3, "c-batna"],
    ]);
    expect(rows[1]!.weather).toEqual({ level: 3, events: ["storm"] });
    expect(rows[1]!.fire).toBeNull();
  });

  it("is empty on a quiet day", () => {
    expect(nationalRanking(units, [], [], DAYS)).toEqual([]);
  });
});

describe("default commune", () => {
  const communes = [
    unit({ id: "c1", code: "1601" }),
    unit({ id: "c2", code: "1502" }),
    unit({ id: "c3", code: "3101" }),
  ];
  const zones = [
    { commune_id: "c3", created_at: "2026-09-20T00:00:00Z" },
    { commune_id: null, created_at: "2026-09-01T00:00:00Z" },
    { commune_id: "c2", created_at: "2026-09-10T00:00:00Z" },
  ];

  it("prefers the link, then the oldest zone with a commune, then this device", () => {
    expect(defaultCommune(communes, "1601", zones, "c3")?.id).toBe("c1");
    expect(defaultCommune(communes, undefined, zones, "c3")?.id).toBe("c2");
    expect(defaultCommune(communes, undefined, [], "c3")?.id).toBe("c3");
  });

  it("shows nobody's place rather than an arbitrary one", () => {
    expect(defaultCommune(communes, undefined, [], null)).toBeNull();
    expect(defaultCommune(communes, "9999", zones, "c3")).toBeNull();
  });
});
