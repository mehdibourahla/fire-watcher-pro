import { describe, expect, it } from "vitest";

import {
  buckets,
  coverage,
  fireRecords,
  historyCsv,
  roadRecords,
  weatherRecords,
  wilayaRanking,
} from "@/lib/hazard-history";
import type { AdminUnit, FireCluster } from "@/lib/nadhir";

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

const units = [
  unit({ id: "w-tizi", level: "wilaya", name_fr: "Tizi Ouzou" }),
  unit({ id: "w-batna", level: "wilaya", name_fr: "Batna" }),
  unit({ id: "c-akbil", parent_id: "w-tizi" }),
];

const cluster = (o: Partial<FireCluster>) =>
  ({
    id: "f1",
    short_id: "DZ1",
    state: "extinguished",
    first_detected_at: "2026-09-02T10:00:00Z",
    est_area_ha: 12,
    wilaya_id: "w-tizi",
    ...o,
  }) as FireCluster;

const records = [
  ...fireRecords([
    cluster({}),
    cluster({ id: "f2", state: "false_positive" }),
    cluster({
      id: "f3",
      first_detected_at: "2026-09-10T09:00:00Z",
      est_area_ha: 30,
    }),
  ]),
  ...weatherRecords([
    {
      id: "o1",
      wilaya_id: "w-batna",
      event: "Thunderstorm",
      severity: "Severe",
      starts_at: "2026-08-31T23:30:00Z",
    },
  ]),
  ...roadRecords(
    [
      {
        id: "r1",
        area_id: "c-akbil",
        published_at: "2026-09-21T16:00:00Z",
        summary: "Accident, RN12",
      },
      {
        id: "r2",
        area_id: "gone",
        published_at: "2026-09-22T16:00:00Z",
        summary: "x",
      },
    ],
    units,
  ),
];

describe("hazard history", () => {
  it("drops screened-out fires and maps each record to its wilaya", () => {
    expect(records.map((r) => [r.id, r.hazard, r.wilayaId])).toEqual([
      ["f1", "fire", "w-tizi"],
      ["f3", "fire", "w-tizi"],
      ["o1", "weather", "w-batna"],
      ["r1", "road", "w-tizi"],
      ["r2", "road", null],
    ]);
    expect(records[2]!.weather).toEqual({ event: "storm", severity: "Severe" });
  });

  it("states when each hazard's records start", () => {
    expect(coverage(records)).toEqual({
      fire: "2026-09-02T10:00:00Z",
      weather: "2026-08-31T23:30:00Z",
      road: "2026-09-21T16:00:00Z",
    });
  });

  it("buckets by Algiers week and keeps empty weeks", () => {
    const { granularity, rows } = buckets(
      records,
      Date.parse("2026-09-25T12:00:00Z"),
    );
    expect(granularity).toBe("week");
    expect(rows.map((r) => r.start)).toEqual([
      "2026-08-31",
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
    ]);
    expect(rows[0]).toMatchObject({ fire: 1, weather: 1, burnedHa: 12 });
    expect(rows[2]).toMatchObject({ fire: 0, weather: 0, road: 0 });
    expect(rows[3]!.road).toBe(2);
  });

  it("switches to months once the archive is long", () => {
    const { granularity, rows } = buckets(
      records,
      Date.parse("2027-02-01T12:00:00Z"),
    );
    expect(granularity).toBe("month");
    expect(rows[0]!.start).toBe("2026-09-01");
  });

  it("ranks wilayas by records, or by burned area for fire alone, and counts the unlocated", () => {
    const all = wilayaRanking(records, units, false);
    expect(all.ranked.map((t) => [t.wilaya.id, t.total])).toEqual([
      ["w-tizi", 3],
      ["w-batna", 1],
    ]);
    expect(all.unlocated).toBe(1);
    const fire = wilayaRanking(
      records.filter((r) => r.hazard === "fire"),
      units,
      true,
    );
    expect(fire.ranked[0]!.burnedHa).toBe(42);
  });

  it("exports one CSV for every hazard and quotes commas", () => {
    const csv = historyCsv(records, units).split("\n");
    expect(csv[0]).toBe("hazard,id,started_at,wilaya,detail");
    expect(csv[1]).toBe("fire,DZ1,2026-09-02T10:00:00Z,Tizi Ouzou,12 ha");
    expect(csv[4]).toBe(
      'road,r1,2026-09-21T16:00:00Z,Tizi Ouzou,"Accident, RN12"',
    );
  });
});
