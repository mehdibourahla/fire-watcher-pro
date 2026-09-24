import { describe, expect, it } from "vitest";

import {
  authorityConcernsZone,
  circleTouchesRing,
  officialConcernsZone,
  roadConcernsZone,
  weatherConcernsZone,
  type ZoneArea,
} from "@/lib/zone-hazards";

const square: [number, number][] = [
  [3.0, 36.5],
  [3.2, 36.5],
  [3.2, 36.7],
  [3.0, 36.7],
  [3.0, 36.5],
];

const zone: ZoneArea = {
  lat: 36.6,
  lon: 3.1,
  radius_km: 5,
  commune_id: "c1",
  communeCode: "1601",
  wilayaId: "w16",
};

describe("circleTouchesRing", () => {
  it("matches a zone whose centre is inside the warning area", () => {
    expect(circleTouchesRing(36.6, 3.1, 1, square)).toBe(true);
  });

  it("matches a zone outside the area whose circle reaches its edge", () => {
    expect(circleTouchesRing(36.6, 3.25, 5, square)).toBe(true);
  });

  it("ignores a zone whose circle stops short of the area", () => {
    expect(circleTouchesRing(36.6, 3.35, 5, square)).toBe(false);
  });
});

describe("weatherConcernsZone", () => {
  it("lets the warning polygon decide even inside the same wilaya", () => {
    const far = { ...zone, lon: 4.0 };
    expect(
      weatherConcernsZone(far, { polygon: square, wilaya_id: "w16" }),
    ).toBe(false);
  });

  it("falls back to the wilaya when the warning carries no polygon", () => {
    expect(weatherConcernsZone(zone, { polygon: null, wilaya_id: "w16" })).toBe(
      true,
    );
    expect(weatherConcernsZone(zone, { polygon: null, wilaya_id: "w09" })).toBe(
      false,
    );
  });
});

describe("officialConcernsZone", () => {
  it("matches the named commune only", () => {
    expect(
      officialConcernsZone(zone, { commune_id: "c1", wilaya_id: "w16" }),
    ).toBe(true);
    expect(
      officialConcernsZone(zone, { commune_id: "c2", wilaya_id: "w16" }),
    ).toBe(false);
  });

  it("matches the whole wilaya when no commune is named", () => {
    expect(
      officialConcernsZone(zone, { commune_id: null, wilaya_id: "w16" }),
    ).toBe(true);
  });
});

describe("authorityConcernsZone", () => {
  it("matches a listed commune code, else the wilaya", () => {
    expect(
      authorityConcernsZone(zone, { commune_codes: ["1601"], wilaya_id: null }),
    ).toBe(true);
    expect(
      authorityConcernsZone(zone, {
        commune_codes: ["0901"],
        wilaya_id: "w16",
      }),
    ).toBe(false);
    expect(
      authorityConcernsZone(zone, { commune_codes: null, wilaya_id: "w16" }),
    ).toBe(true);
  });
});

describe("roadConcernsZone", () => {
  it("matches a publication about the zone's commune or its wilaya", () => {
    expect(roadConcernsZone(zone, { area_id: "c1" })).toBe(true);
    expect(roadConcernsZone(zone, { area_id: "w16" })).toBe(true);
    expect(roadConcernsZone(zone, { area_id: "c2" })).toBe(false);
  });
});
