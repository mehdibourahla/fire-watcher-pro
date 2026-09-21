import { describe, expect, it } from "vitest";
import type { Situation } from "../civil-map";
import { civilMapGeoJSON, situationAreaId } from "../civil-map-geometry";

const polygon = {
  type: "Polygon",
  coordinates: [
    [
      [3, 36],
      [4, 36],
      [4, 37],
      [3, 36],
    ],
  ],
};
const official: Extract<Situation, { source: "official" }> = {
  id: "official:i1",
  source: "official",
  category: "fire",
  at: "2026-09-16T12:00:00Z",
  lat: 36.5,
  lon: 3.5,
  areaId: "w1",
  wilayaId: "w1",
  ended: false,
  candidate: false,
  data: {
    id: "i1",
    wilaya_id: "w1",
    commune_id: "c1",
    precision: "wilaya",
    kind: "vegetation",
    status: "ongoing",
    authority_tier: "national",
    place_text: null,
    first_reported_at: "2026-09-16T12:00:00Z",
    last_reported_at: "2026-09-16T12:00:00Z",
    as_of: "2026-09-16T12:00:00Z",
    unlisted_at: null,
    mention_count: 1,
    evidence: "Fire",
    commune: null,
    wilaya: {
      name_ar: "ولاية",
      name_fr: "Wilaya",
      name_en: "Wilaya",
      name_kab: "Wilaya",
      lat: 36.5,
      lon: 3.5,
    },
    latest_mention: null,
  },
};

describe("civil map administrative geometry", () => {
  it("maps reviewed civil information at area precision and never maps historical tombstones", () => {
    const item: Situation = {
      ...official,
      id: "civil:p",
      source: "civil",
      category: "road",
      data: {
        id: "p",
        ita_report_id: "r",
        incident_index: 0,
        hazard: "road",
        summary: "Route fermée",
        area_id: "w1",
        source_name: "Info Trafic Algérie",
        source_url: "https://infotraficalgerie.com/home",
        source_published_at: official.at,
        published_at: official.at,
        updated_at: official.at,
        expires_at: "2026-09-17T12:00:00Z",
        state: "published",
        revision: 1,
        cap_references: [],
        area: {
          ...official.data.wilaya!,
          id: "w1",
          code: "01",
          level: "wilaya",
          parent_id: null,
        },
      },
    };
    const result = civilMapGeoJSON(
      [item],
      new Map([["w1", polygon]]),
      () => "Road",
      item.id,
    );
    expect(result.official.features).toEqual([]);
    expect(result.reports.features.map((f) => f.geometry.type)).toEqual([
      "Polygon",
      "Point",
    ]);
    expect(result.reports.features[1]?.properties).toMatchObject({
      id: "civil:p",
      source: "civil",
      precision: "wilaya",
      category: "road",
    });
    expect(
      civilMapGeoJSON(
        [{ ...item, ended: true }],
        new Map([["w1", polygon]]),
        () => "Road",
        item.id,
      ).reports.features,
    ).toEqual([]);
    expect(situationAreaId({ ...item, ended: true })).toBeNull();
  });
  it("uses only the ONM declared wilaya and keeps severity separate from source", () => {
    const item: Situation = {
      ...official,
      id: "weather:w1",
      source: "onm",
      category: "weather",
      data: {
        id: "warning1",
        cap_id: "cap1",
        title: "Rain",
        event: "Pluie",
        severity: "Severe",
        urgency: "Future",
        certainty: "Likely",
        onset: official.at,
        expires: "2026-09-17T12:00:00Z",
        sent: official.at,
        area_desc: "Wilaya",
        cap_url: null,
        wilaya_id: "w1",
        headline_fr: null,
      },
    };
    const result = civilMapGeoJSON(
      [item],
      new Map([["w1", polygon]]),
      () => "Rain warning",
      item.id,
    );
    expect(result.warnings.features).toHaveLength(2);
    expect(result.warnings.features[0]?.properties).toMatchObject({
      id: "warning1",
      source: "onm",
      status: "Severe",
      precision: "wilaya",
    });
    const second = {
      ...item,
      id: "weather:w2",
      data: { ...item.data, id: "warning2" },
    };
    const sameArea = civilMapGeoJSON(
      [item, second],
      new Map([["w1", polygon]]),
      () => "Warning",
      second.id,
    );
    expect(
      sameArea.warnings.features.filter(
        (feature) => feature.geometry.type === "Point",
      ),
    ).toHaveLength(2);
    expect(
      sameArea.warnings.features
        .filter((feature) => feature.properties?.["area"])
        .map((feature) => feature.properties?.["situationId"]),
    ).toEqual([second.id]);
    expect(
      civilMapGeoJSON(
        [item, second],
        new Map([["w1", polygon]]),
        () => "Warning",
      ).warnings.features.every((feature) => feature.geometry.type === "Point"),
    ).toBe(true);
    expect(
      civilMapGeoJSON(
        [
          {
            ...item,
            lat: null,
            lon: null,
            data: { ...item.data, wilaya_id: null },
          },
        ],
        new Map([["w1", polygon]]),
        () => "",
        item.id,
      ).warnings.features,
    ).toEqual([]);
  });

  it("uses declared wilaya precision despite a retained commune and gives both shapes one selection identity", () => {
    const result = civilMapGeoJSON(
      [official],
      new Map([
        ["w1", polygon],
        ["c1", { ...polygon, coordinates: [] }],
      ]),
      () => "Reported area",
      official.id,
    );
    expect(situationAreaId(official)).toBe("w1");
    expect(result.official.features.map((f) => f.geometry.type)).toEqual([
      "Polygon",
      "Point",
    ]);
    expect(result.official.features.map((f) => f.id)).toEqual([
      "official:i1:area",
      "official:i1:point",
    ]);
    for (const feature of result.official.features)
      expect(feature.properties).toMatchObject({
        id: "i1",
        situationId: official.id,
        selected: true,
        label: "Reported area",
        precision: "wilaya",
      });
  });

  it("does not substitute a wilaya polygon for missing commune geometry", () => {
    const item: Situation = {
      ...official,
      areaId: "c1",
      data: { ...official.data, precision: "commune" },
    };
    expect(situationAreaId(item)).toBe("c1");
    expect(
      civilMapGeoJSON(
        [item],
        new Map([["w1", polygon]]),
        () => "",
        item.id,
      ).official.features.map((f) => f.geometry.type),
    ).toEqual(["Point"]);
  });

  it.each([
    { type: "Point", coordinates: [3, 36] },
    { type: "Polygon", coordinates: [] },
    {
      type: "Polygon",
      coordinates: [
        [
          [3, 36],
          [4, 36],
          [4, 37],
          [3, 37],
        ],
      ],
    },
    {
      type: "Polygon",
      coordinates: [
        [
          [3, 36],
          [Infinity, 36],
          [4, 37],
          [3, 36],
        ],
      ],
    },
    { type: "MultiPolygon", coordinates: [] },
  ])(
    "rejects malformed/non-area geometry without losing the valid marker",
    (geometry) => {
      expect(
        civilMapGeoJSON(
          [official],
          new Map([["w1", geometry]]),
          () => "",
          official.id,
        ).official.features.map((f) => f.geometry.type),
      ).toEqual(["Point"]);
    },
  );

  it("can show a valid boundary without inventing a marker for unknown coordinates", () => {
    const item = { ...official, lat: null, lon: null };
    expect(
      civilMapGeoJSON(
        [item],
        new Map([
          ["w1", { type: "MultiPolygon", coordinates: [polygon.coordinates] }],
        ]),
        () => "",
        item.id,
      ).official.features.map((f) => f.geometry.type),
    ).toEqual(["MultiPolygon"]);
    expect(
      civilMapGeoJSON([{ ...item, lat: 95, lon: 3 }], new Map(), () => "")
        .official.features,
    ).toEqual([]);
  });

  it("keeps citizen reports as points even if an area ID is present", () => {
    const item: Situation = {
      ...official,
      id: "report:r1",
      source: "citizen",
      category: "road",
      data: {
        id: "r1",
        kind: "road_blocked",
        sighting: "other",
        lat: 36.5,
        lon: 3.5,
        observed_at: official.at,
        created_at: official.at,
        status: "pending",
      },
    };
    const result = civilMapGeoJSON(
      [item],
      new Map([["w1", polygon]]),
      () => "Road blocked",
    );
    expect(result.reports.features).toHaveLength(1);
    expect(result.reports.features[0]?.properties).toMatchObject({
      kind: "road_blocked",
      source: "citizen",
      area: false,
      selected: false,
    });
  });
});
