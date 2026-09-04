import { describe, expect, it } from "vitest";

import {
  fireStage,
  officialIncidentsGeoJSON,
  type OfficialIncident,
} from "@/lib/nadhir";

const unit = {
  name_ar: "عزابة",
  name_fr: "Azzaba",
  name_en: "Azzaba",
  name_kab: null,
  lat: 36.73,
  lon: 7.1,
};
const wilaya = {
  name_ar: "سكيكدة",
  name_fr: "Skikda",
  name_en: "Skikda",
  name_kab: null,
  lat: 36.87,
  lon: 6.9,
};

function incident(over: Partial<OfficialIncident>): OfficialIncident {
  return {
    id: "inc-1",
    wilaya_id: "w1",
    commune_id: "c1",
    kind: "vegetation",
    status: "ongoing",
    precision: "commune",
    authority_tier: "national",
    place_text: null,
    first_reported_at: "2026-09-02T06:00:00Z",
    last_reported_at: "2026-09-02T12:00:00Z",
    as_of: "2026-09-02T12:00:00Z",
    unlisted_at: null,
    mention_count: 2,
    evidence: "حريق ببلدية عزابة",
    commune: unit,
    wilaya,
    latest_mention: null,
    ...over,
  };
}

const square = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [7.0, 36.7],
        [7.2, 36.7],
        [7.2, 36.8],
        [7.0, 36.8],
        [7.0, 36.7],
      ],
    ],
  ],
};

describe("officialIncidentsGeoJSON", () => {
  it("draws a commune-level incident as its commune polygon", () => {
    const fc = officialIncidentsGeoJSON(
      [incident({})],
      new Map([["c1", square]]),
      Date.parse("2026-09-02T13:00:00Z"),
    );
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.geometry.type).toBe("MultiPolygon");
    expect(fc.features[0]!.properties).toMatchObject({
      id: "inc-1",
      status: "ongoing",
      area: true,
    });
  });

  it("falls back to a wilaya-centroid marker when there is no polygon", () => {
    const fc = officialIncidentsGeoJSON(
      [incident({ commune_id: null, commune: null, precision: "wilaya" })],
      new Map(),
      Date.parse("2026-09-02T13:00:00Z"),
    );
    expect(fc.features[0]!.geometry).toEqual({
      type: "Point",
      coordinates: [6.9, 36.87],
    });
    expect(fc.features[0]!.properties).toMatchObject({
      area: false,
      precision: "wilaya",
    });
  });

  it("hides extinguished incidents a day after their last report", () => {
    const old = incident({
      status: "extinguished",
      last_reported_at: "2026-09-01T06:00:00Z",
    });
    const fresh = incident({
      id: "inc-2",
      status: "extinguished",
      last_reported_at: "2026-09-02T06:00:00Z",
    });
    const fc = officialIncidentsGeoJSON(
      [old, fresh],
      new Map([["c1", square]]),
      Date.parse("2026-09-02T13:00:00Z"),
    );
    expect(fc.features.map((f) => f.properties!["id"])).toEqual(["inc-2"]);
  });
});

describe("listing", () => {
  it("marks an incident the authority stopped naming, and keeps it on the map", () => {
    const listed = officialIncidentsGeoJSON([incident({})], new Map());
    expect(listed.features[0]!.properties!["listed"]).toBe(true);
    const dropped = officialIncidentsGeoJSON(
      [incident({ unlisted_at: "2026-09-02T17:00:00Z" })],
      new Map(),
    );
    expect(dropped.features).toHaveLength(1);
    expect(dropped.features[0]!.properties!["listed"]).toBe(false);
  });
});

describe("fireStage", () => {
  it("is a candidate on one look, detected on two, confirmed only by an authority", () => {
    expect(fireStage({ state: "unconfirmed", confirmed_at: null })).toBe(
      "candidate",
    );
    expect(fireStage({ state: "active", confirmed_at: null })).toBe("detected");
    expect(fireStage({ state: "contained_guess", confirmed_at: null })).toBe(
      "detected",
    );
    expect(
      fireStage({ state: "active", confirmed_at: "2026-09-02T07:00:00Z" }),
    ).toBe("confirmed");
    expect(
      fireStage({ state: "unconfirmed", confirmed_at: "2026-09-02T07:00:00Z" }),
    ).toBe("confirmed");
  });
});
