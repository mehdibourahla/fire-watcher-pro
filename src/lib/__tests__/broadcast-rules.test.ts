import { describe, expect, it } from "vitest";

import {
  BROADCAST_DAILY_COMMUNE_LIMIT,
  applyDailyLimit,
  downwindAdditions,
  fireSeverity,
  kmToMultiPolygon,
  planFireBroadcast,
  pointInMultiPolygon,
  fuelLimitedCodes,
  targetCommunes,
  type CommuneShape,
} from "@/lib/broadcast-rules";

const square = (
  code: string,
  lonMin: number,
  lonMax: number,
  latMin: number,
  latMax: number,
): CommuneShape => ({
  code,
  lat: (latMin + latMax) / 2,
  lon: (lonMin + lonMax) / 2,
  geom: {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [lonMin, latMin],
          [lonMax, latMin],
          [lonMax, latMax],
          [lonMin, latMax],
          [lonMin, latMin],
        ],
      ],
    ],
  },
});

const home = square("1503", 4.2, 4.4, 36.6, 36.8);

describe("pointInMultiPolygon", () => {
  it("detects containment", () => {
    expect(pointInMultiPolygon(36.7, 4.3, home.geom)).toBe(true);
    expect(pointInMultiPolygon(36.5, 4.3, home.geom)).toBe(false);
    expect(pointInMultiPolygon(36.7, 4.3, null)).toBe(false);
  });
});

describe("kmToMultiPolygon", () => {
  it("is zero inside and the edge distance outside", () => {
    expect(kmToMultiPolygon(36.7, 4.3, home.geom)).toBe(0);
    const south = kmToMultiPolygon(36.5, 4.3, home.geom);
    expect(south).toBeGreaterThan(10);
    expect(south).toBeLessThan(12.5);
    expect(kmToMultiPolygon(36.7, 4.3, null)).toBe(Infinity);
  });
});

describe("targetCommunes", () => {
  const near = square("1510", 4.38, 4.5, 36.6, 36.8);
  const far = square("1590", 4.6, 4.7, 36.6, 36.8);

  it("targets the containing commune plus the 15 km ring", () => {
    const codes = targetCommunes({ lat: 36.7, lon: 4.3, communeCode: null }, [
      far,
      near,
      home,
    ]);
    expect(codes).toEqual(["1503", "1510"]);
  });

  it("falls back to the fusion commune when no polygon contains the fire", () => {
    const codes = targetCommunes({ lat: 36.7, lon: 4.3, communeCode: "0601" }, [
      { code: "0601", lat: 36.7, lon: 4.3, geom: null },
    ]);
    expect(codes).toEqual(["0601"]);
  });
});

describe("fireSeverity", () => {
  it("escalates on settlement proximity", () => {
    expect(fireSeverity(4.9)).toBe("Extreme");
    expect(fireSeverity(5.1)).toBe("Severe");
    expect(fireSeverity(null)).toBe("Severe");
  });
});

describe("downwindAdditions", () => {
  const east = square("2001", 4.45, 4.55, 36.65, 36.75);
  const west = square("2002", 4.05, 4.15, 36.65, 36.75);
  const byCode = new Map([
    ["2001", east],
    ["2002", west],
  ]);

  it("keeps only new communes in the downwind direction", () => {
    expect(
      downwindAdditions(
        { lat: 36.7, lon: 4.3, spreadBearing: 90 },
        ["1503"],
        ["1503", "2001", "2002"],
        byCode,
      ),
    ).toEqual(["2001"]);
  });

  it("adds nothing without a known spread direction", () => {
    expect(
      downwindAdditions(
        { lat: 36.7, lon: 4.3, spreadBearing: null },
        ["1503"],
        ["1503", "2001"],
        byCode,
      ),
    ).toEqual([]);
  });
});

describe("planFireBroadcast", () => {
  const HOUR = 3600_000;
  const now = Date.parse("2026-08-30T12:00:00Z");
  const base = {
    state: "active",
    confidence: 0.7,
    lastDetectedMs: now - HOUR,
    nowMs: now,
    severity: "Severe" as const,
    open: null,
    targets: ["1503", "1510"],
    additions: [],
  };

  it("opens a thread for a confirmed cluster", () => {
    expect(planFireBroadcast(base)).toEqual({
      action: "initial",
      codes: ["1503", "1510"],
    });
  });

  it("never opens below the confidence floor or before confirmation", () => {
    expect(planFireBroadcast({ ...base, confidence: 0.5 })).toBeNull();
    expect(planFireBroadcast({ ...base, state: "unconfirmed" })).toBeNull();
  });

  it("ends observation-honestly after 12 h without detections", () => {
    expect(
      planFireBroadcast({
        ...base,
        state: "contained_guess",
        lastDetectedMs: now - 13 * HOUR,
        open: { phase: "initial", communeCodes: ["1503"], severity: "Severe" },
      }),
    ).toEqual({ action: "end" });
  });

  it("cancels when the cluster turns out to be a false positive", () => {
    expect(
      planFireBroadcast({
        ...base,
        state: "false_positive",
        open: { phase: "initial", communeCodes: ["1503"], severity: "Severe" },
      }),
    ).toEqual({ action: "cancel" });
  });

  it("updates when the fire spreads downwind into new communes", () => {
    expect(
      planFireBroadcast({
        ...base,
        open: { phase: "initial", communeCodes: ["1503"], severity: "Severe" },
        additions: ["1510"],
      }),
    ).toEqual({ action: "update", codes: ["1503", "1510"], added: ["1510"] });
  });

  it("updates when severity escalates even without new communes", () => {
    expect(
      planFireBroadcast({
        ...base,
        severity: "Extreme",
        open: { phase: "update", communeCodes: ["1503"], severity: "Severe" },
      }),
    ).toEqual({ action: "update", codes: ["1503"], added: [] });
  });

  it("stays silent while nothing changed", () => {
    expect(
      planFireBroadcast({
        ...base,
        open: { phase: "initial", communeCodes: ["1503"], severity: "Severe" },
        targets: ["1503"],
      }),
    ).toBeNull();
  });

  it("reopens a fresh thread if a closed fire flares up again", () => {
    expect(
      planFireBroadcast({
        ...base,
        open: { phase: "end", communeCodes: ["1503"], severity: "Severe" },
      }),
    ).toEqual({ action: "initial", codes: ["1503", "1510"] });
  });
});

describe("fuelLimitedCodes", () => {
  const communes = [
    {
      code: "3306",
      landcover: {
        tree: 0,
        shrub: 0,
        grass: 0,
        crop: 0,
        bare: 1,
        built: 0,
        water: 0,
        other: 0,
      },
    },
    {
      code: "1518",
      landcover: {
        tree: 0.5,
        shrub: 0.1,
        grass: 0.2,
        crop: 0.14,
        bare: 0.06,
        built: 0,
        water: 0,
        other: 0,
      },
    },
    { code: "9999", landcover: null },
  ];

  it("names the communes with nothing to burn", () => {
    expect(fuelLimitedCodes(communes)).toEqual(new Set(["3306"]));
  });

  it("never masks a commune whose land cover is unknown", () => {
    expect(fuelLimitedCodes([{ code: "9999", landcover: null }]).size).toBe(0);
  });
});

describe("planFireBroadcast fuel gate", () => {
  const HOUR = 3600_000;
  const now = Date.parse("2026-08-30T12:00:00Z");
  const base = {
    state: "active",
    confidence: 0.7,
    lastDetectedMs: now - HOUR,
    nowMs: now,
    severity: "Extreme" as const,
    open: null,
    targets: ["3306"],
    additions: [],
    fuelLimited: new Set(["3306"]),
  };

  it("does not open a thread where every target commune has no fuel", () => {
    expect(planFireBroadcast(base)).toBeNull();
  });

  it("still opens for the communes that can burn", () => {
    expect(planFireBroadcast({ ...base, targets: ["3306", "1518"] })).toEqual({
      action: "initial",
      codes: ["1518"],
    });
  });

  it("still closes a thread that was already open", () => {
    expect(
      planFireBroadcast({
        ...base,
        lastDetectedMs: now - 13 * HOUR,
        open: { phase: "initial", communeCodes: ["3306"], severity: "Extreme" },
      }),
    ).toEqual({ action: "end" });
  });
});

describe("applyDailyLimit", () => {
  const atLimit = new Map([["1503", BROADCAST_DAILY_COMMUNE_LIMIT]]);

  it("drops communes that already got their daily share", () => {
    expect(applyDailyLimit(["1503", "1510"], atLimit, false)).toEqual({
      allowed: ["1510"],
      dropped: ["1503"],
    });
  });

  it("never drops exempt messages", () => {
    expect(applyDailyLimit(["1503"], atLimit, true)).toEqual({
      allowed: ["1503"],
      dropped: [],
    });
  });
});
