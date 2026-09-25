import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { historyCsv, historyRecord } from "@/lib/hazard-history";
import type { AdminUnit } from "@/lib/nadhir";

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

const row = (o: Partial<Parameters<typeof historyRecord>[0]>) =>
  historyRecord({
    id: "x",
    hazard: "road",
    at: "2026-09-22T10:00:00Z",
    wilaya_id: null,
    short_id: null,
    area_ha: 0,
    state: null,
    event: null,
    severity: null,
    summary: null,
    ...o,
  });

const records = [
  row({
    id: "f1",
    hazard: "fire",
    at: "2026-09-02T10:00:00Z",
    wilaya_id: "w-tizi",
    short_id: "DZ1",
    area_ha: 12,
    state: "extinguished",
  }),
  row({
    id: "o1",
    hazard: "weather",
    at: "2026-08-31T23:30:00Z",
    wilaya_id: "w-batna",
    event: "Thunderstorm",
    severity: "Severe",
  }),
  row({
    id: "o2",
    hazard: "weather",
    at: "2026-08-30T23:30:00Z",
    wilaya_id: "w-batna",
    event: "Fog",
    severity: "Moderate",
  }),
  row({
    id: "r1",
    hazard: "road",
    at: "2026-09-21T16:00:00Z",
    wilaya_id: "w-tizi",
    summary: "Accident, RN12",
  }),
];

describe("hazard history", () => {
  it("maps server rows to records, weather events to the map's categories", () => {
    expect(records.map((r) => [r.id, r.hazard, r.wilayaId])).toEqual([
      ["f1", "fire", "w-tizi"],
      ["o1", "weather", "w-batna"],
      ["o2", "weather", "w-batna"],
      ["r1", "road", "w-tizi"],
    ]);
    expect(records[0]!.fire).toEqual({
      shortId: "DZ1",
      areaHa: 12,
      state: "extinguished",
    });
    expect(records[1]!.weather).toEqual({ event: "storm", severity: "Severe" });
    expect(records[2]!.weather?.event).toBe("other");
  });

  it("exports one CSV for every hazard and quotes commas", () => {
    const csv = historyCsv(records, units).split("\n");
    expect(csv[0]).toBe("hazard,id,started_at,wilaya,detail");
    expect(csv[1]).toBe("fire,DZ1,2026-09-02T10:00:00Z,Tizi Ouzou,12 ha");
    expect(csv[4]).toBe(
      'road,r1,2026-09-21T16:00:00Z,Tizi Ouzou,"Accident, RN12"',
    );
  });

  it("neutralises a leading tab or carriage return too", () => {
    const rows = ["\t=1+1", "\r@SUM(A1)"].map((summary, i) =>
      row({ id: `t${i}`, wilaya_id: "w-tizi", summary }),
    );
    const lines = historyCsv(rows, units).split("\n");
    expect(lines[1]!.endsWith(",'\t=1+1")).toBe(true);
    expect(lines[2]!.endsWith(`,"'\r@SUM(A1)"`)).toBe(true);
  });

  it("never lets exported text run as a spreadsheet formula", () => {
    const formula = row({
      id: "r9",
      wilaya_id: "w-tizi",
      summary: '=HYPERLINK("http://x")',
    });
    expect(historyCsv([formula], units).split("\n")[1]).toBe(
      'road,r9,2026-09-22T10:00:00Z,Tizi Ouzou,"\'=HYPERLINK(""http://x"")"',
    );
  });
});
