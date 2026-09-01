import { describe, expect, it } from "vitest";

import {
  computeFwi,
  dangerFromFwi,
  nextDc,
  nextDmc,
  nextFfmc,
} from "@/lib/ingest/fwi";
import {
  dangerLevelKey,
  levelFromFwi,
  nationalMaximum,
  type RiskForecast,
} from "@/lib/nadhir";

describe("levelFromFwi", () => {
  it("maps the EFFIS thresholds from ORIGINAL-SPEC 9.1", () => {
    expect(levelFromFwi(0)).toBe(1);
    expect(levelFromFwi(11.1)).toBe(1);
    expect(levelFromFwi(11.2)).toBe(2);
    expect(levelFromFwi(21.2)).toBe(2);
    expect(levelFromFwi(21.3)).toBe(3);
    expect(levelFromFwi(37.9)).toBe(3);
    expect(levelFromFwi(38)).toBe(4);
    expect(levelFromFwi(49.9)).toBe(4);
    expect(levelFromFwi(50)).toBe(5);
  });
});

function forecast(over: Partial<RiskForecast>): RiskForecast {
  return {
    id: "f",
    commune_id: "c",
    forecast_date: "2026-09-01",
    horizon_days: 0,
    source: "local_fwi",
    fwi: 5,
    danger_level: 1,
    fuel_limited: false,
    snapshot_id: null,
    ...over,
  };
}

describe("nationalMaximum", () => {
  it("is null when no forecast is published, never a fabricated Low", () => {
    expect(nationalMaximum([])).toBeNull();
  });

  it("ignores later horizons and fuel-limited communes", () => {
    expect(
      nationalMaximum([
        forecast({ horizon_days: 1, danger_level: 5, fwi: 60 }),
        forecast({ fuel_limited: true, danger_level: 5, fwi: 60 }),
      ]),
    ).toBeNull();
  });

  it("reports the real FWI on an all-Low day", () => {
    expect(
      nationalMaximum([forecast({ fwi: 3 }), forecast({ fwi: 9 })]),
    ).toEqual({ level: 1, fwi: 9 });
  });

  it("picks the highest level, then the highest FWI within it", () => {
    expect(
      nationalMaximum([
        forecast({ danger_level: 4, fwi: 45 }),
        forecast({ danger_level: 4, fwi: 41 }),
        forecast({ danger_level: 3, fwi: 30 }),
      ]),
    ).toEqual({ level: 4, fwi: 45 });
  });
});

describe("dangerLevelKey", () => {
  it("clamps out-of-range levels", () => {
    expect(dangerLevelKey(0)).toBe("low");
    expect(dangerLevelKey(1)).toBe("low");
    expect(dangerLevelKey(5)).toBe("extreme");
    expect(dangerLevelKey(9)).toBe("extreme");
  });
});

describe("dangerFromFwi — the scale the ingest pipeline writes to the DB", () => {
  it("uses the same EFFIS thresholds as the client", () => {
    for (const fwi of [0, 5, 11.1, 11.2, 21.2, 21.3, 37.9, 38, 49.9, 50, 90]) {
      expect(dangerFromFwi(fwi)).toBe(levelFromFwi(fwi));
    }
  });

  it("does not inflate mid-range values by a level", () => {
    expect(dangerFromFwi(8)).toBe(1);
    expect(dangerFromFwi(15)).toBe(2);
    expect(dangerFromFwi(25)).toBe(3);
    expect(dangerFromFwi(45)).toBe(4);
  });
});

describe("CFFDRS implementation vs Van Wagner reference (spec 18)", () => {
  it("matches the published test case within 0.1", () => {
    // Van Wagner & Pickett (1985): T=17C, RH=42%, wind=25 km/h, no rain, April,
    // starting FFMC 85, DMC 6, DC 15.
    const ffmc = nextFfmc(85, 17, 42, 25, 0);
    const dmc = nextDmc(6, 17, 42, 0, 4);
    const dc = nextDc(15, 17, 0, 4);
    const { isi, bui, fwi } = computeFwi(ffmc, dmc, dc, 25);

    expect(ffmc).toBeCloseTo(87.692, 1);
    expect(dmc).toBeCloseTo(8.545, 1);
    expect(dc).toBeCloseTo(19.013, 1);
    expect(isi).toBeCloseTo(10.853, 1);
    expect(bui).toBeCloseTo(8.497, 1);
    expect(fwi).toBeCloseTo(10.096, 1);
  });
});
