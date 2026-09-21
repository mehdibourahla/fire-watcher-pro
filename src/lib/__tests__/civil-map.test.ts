import { describe, expect, it } from "vitest";
import {
  buildSituations,
  filterSituations,
  findPlaces,
  nearestPlace,
  selectedSituation,
} from "../civil-map";
import type {
  AdminUnit,
  FireCluster,
  OfficialIncident,
  OnmVigilance,
} from "../nadhir";
import type { HazardReport } from "../open-areas";

const now = Date.parse("2026-09-16T12:00:00Z");
const at = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
const commune: AdminUnit = {
  id: "c1",
  level: "commune",
  code: "0601",
  name_ar: "بجاية",
  name_fr: "Béjaïa",
  name_en: "Bejaia",
  name_kab: "Bgayet",
  parent_id: "w1",
  lat: 36.75,
  lon: 5.08,
  forest_fraction: 0,
  population: null,
};
const wilaya: AdminUnit = {
  ...commune,
  id: "w1",
  level: "wilaya",
  parent_id: null,
  code: "06",
};
const other: AdminUnit = {
  ...commune,
  id: "c2",
  parent_id: "w2",
  lat: 36,
  lon: 3,
};
const units = [commune, wilaya, other];
const fire = (over: Partial<FireCluster> = {}): FireCluster => ({
  id: "f",
  short_id: "F",
  state: "active",
  first_detected_at: at(5),
  last_detected_at: at(1),
  lat: 36.75,
  lon: 5.08,
  detection_count: 2,
  sources: ["firms"],
  max_frp_mw: null,
  confidence: 80,
  est_area_ha: null,
  fci_growth: null,
  wind_speed_kmh: null,
  wind_dir_deg: null,
  spread_bearing_deg: null,
  wind_gust_kmh: null,
  vpd_kpa: null,
  soil_moisture_m3m3: null,
  commune_id: "c1",
  wilaya_id: "w1",
  nearest_settlement_id: null,
  nearest_settlement_km: null,
  confirmed_at: null,
  confirmed_mention_id: null,
  ...over,
});
const official = (over: Partial<OfficialIncident> = {}): OfficialIncident => ({
  id: "i",
  wilaya_id: "w1",
  commune_id: "c1",
  kind: "vegetation",
  status: "ongoing",
  precision: "commune",
  authority_tier: "national",
  place_text: null,
  first_reported_at: at(5),
  last_reported_at: at(1),
  as_of: at(1),
  unlisted_at: null,
  mention_count: 1,
  evidence: "حريق",
  commune,
  wilaya,
  latest_mention: null,
  ...over,
});
const report = (over: Partial<HazardReport> = {}): HazardReport => ({
  id: "r",
  kind: "sighting",
  sighting: "flames",
  lat: 36.75,
  lon: 5.08,
  observed_at: at(1),
  created_at: at(1),
  status: "pending",
  ...over,
});
const warning = (over: Partial<OnmVigilance> = {}): OnmVigilance => ({
  id: "w",
  cap_id: "cap",
  title: "Vigilance",
  event: "Pluie",
  severity: "Severe",
  urgency: "Future",
  certainty: "Likely",
  onset: at(-2),
  expires: at(-10),
  sent: at(1),
  area_desc: "Béjaïa",
  cap_url: null,
  wilaya_id: "w1",
  headline_fr: null,
  ...over,
});
const build = (over: Partial<Parameters<typeof buildSituations>[0]> = {}) =>
  buildSituations({
    fires: [],
    official: [],
    reports: [],
    warnings: [],
    units,
    now,
    ...over,
  });
const filters = {
  category: "all" as const,
  area: null,
  showEnded: false,
  showCandidates: false,
};

describe("civil situations", () => {
  it("keeps reviewed publications available for historical links but excludes inactive publications from current results", () => {
    const publication = {
      id: "p",
      ita_report_id: "r",
      incident_index: 0,
      hazard: "flood" as const,
      summary: "Route inondée",
      area_id: "w1",
      source_name: "Info Trafic Algérie",
      source_url: "https://infotraficalgerie.com/home",
      source_published_at: at(2),
      published_at: at(1),
      updated_at: at(1),
      expires_at: at(-2),
      state: "published" as const,
      revision: 1,
      area: wilaya,
      cap_references: [],
    };
    const items = build({
      publications: [
        publication,
        {
          ...publication,
          id: "expired",
          updated_at: at(100),
          expires_at: at(99),
        },
        { ...publication, id: "withdrawn", state: "withdrawn" },
      ],
    });
    expect(items).toHaveLength(3);
    expect(
      filterSituations(items, { ...filters, area: commune }, units).map(
        (i) => i.id,
      ),
    ).toEqual(["civil:p"]);
    expect(items.find((i) => i.id === "civil:p")).toMatchObject({
      source: "civil",
      category: "weather",
      areaId: "w1",
      wilayaId: "w1",
      lat: wilaya.lat,
    });
    expect(
      filterSituations(items, { ...filters, showEnded: true }, units),
    ).toHaveLength(3);
    expect(selectedSituation(items, [], "civil:expired")?.id).toBe(
      "civil:expired",
    );
    expect(selectedSituation(items, [], "civil:withdrawn")?.ended).toBe(true);
    expect(selectedSituation(items, [], "civil:missing")).toBeUndefined();
  });
  it("enforces source time windows and rejects invalid or future observations", () => {
    expect(
      build({
        fires: [
          fire(),
          fire({ id: "old", last_detected_at: at(73) }),
          fire({ id: "false", state: "false_positive" }),
          fire({ id: "future", last_detected_at: at(-1) }),
          fire({ id: "invalid", last_detected_at: "bad" }),
        ],
        official: [
          official({ last_reported_at: at(72) }),
          official({ id: "old", last_reported_at: at(73) }),
        ],
        reports: [
          report(),
          report({ id: "old", observed_at: at(25) }),
          report({ id: "rejected", status: "rejected" }),
        ],
      })
        .map((x) => x.id)
        .sort(),
    ).toEqual(["fire:f", "official:i", "report:r"]);
  });
  it("does not call contained, unknown or unlisted official incidents ended", () => {
    const items = build({
      official: [
        official({ id: "contained", status: "contained" }),
        official({ id: "unknown", status: "unknown", unlisted_at: at(1) }),
        official({ id: "ended", status: "extinguished" }),
      ],
      fires: [
        fire({ id: "candidate", state: "unconfirmed" }),
        fire({ id: "confirmed", state: "unconfirmed", confirmed_at: at(1) }),
        fire({ id: "ended", state: "extinguished" }),
      ],
    });
    expect(
      filterSituations(items, filters, units)
        .map((x) => x.id)
        .sort(),
    ).toEqual(["fire:confirmed", "official:contained", "official:unknown"]);
    expect(
      filterSituations(
        items,
        { ...filters, showEnded: true, showCandidates: true },
        units,
      ),
    ).toHaveLength(6);
  });
  it("includes upcoming ONM warnings but excludes expired, undated and unsent warnings", () => {
    const items = build({
      warnings: [
        warning(),
        warning({ id: "expired", expires: at(0) }),
        warning({ id: "missing", expires: null }),
        warning({ id: "future", sent: at(-1) }),
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "weather:w",
      source: "onm",
      category: "weather",
      areaId: "w1",
      lat: 36.75,
    });
    expect(items[0]?.data).toMatchObject({ onset: at(-2) });
  });
  it("keeps missing positions unknown and never infers report admin membership", () => {
    expect(
      build({
        reports: [report({ lat: NaN })],
        warnings: [warning({ wilaya_id: null })],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "report:r",
          lat: null,
          lon: null,
          areaId: null,
          wilayaId: null,
        }),
        expect.objectContaining({
          id: "weather:w",
          lat: null,
          lon: null,
          areaId: null,
        }),
      ]),
    );
  });
  it("classifies citizen hazards without treating trapped people or other sightings as fires", () => {
    const items = build({
      reports: [
        report({ id: "road", kind: "road_blocked" }),
        report({ id: "person", kind: "person_trapped" }),
        report({ id: "other", sighting: "other" }),
        report({ id: "smoke", sighting: "smoke" }),
      ],
    });
    expect(
      filterSituations(items, { ...filters, category: "fire" }, units).map(
        (x) => x.id,
      ),
    ).toEqual(["report:smoke"]);
    expect(
      filterSituations(items, { ...filters, category: "road" }, units).map(
        (x) => x.id,
      ),
    ).toEqual(["report:road"]);
  });
  it("includes wilaya-wide warnings and incidents in a commune without pulling other communes", () => {
    const items = build({
      official: [
        official({ commune_id: null, commune: null, precision: "wilaya" }),
        official({ id: "other", commune_id: "c2", commune: other }),
      ],
      warnings: [warning()],
      fires: [fire({ commune_id: "c2" })],
      reports: [report(), report({ id: "far", lat: 36, lon: 3 })],
    });
    expect(
      filterSituations(items, { ...filters, area: commune }, units)
        .map((x) => x.id)
        .sort(),
    ).toEqual(["official:i", "report:r", "weather:w"]);
    expect(
      filterSituations(items, { ...filters, area: wilaya }, units).some(
        (x) => x.id === "report:far",
      ),
    ).toBe(false);
  });
});

describe("civil places", () => {
  it("searches names in every language with accent-insensitive deterministic bounded results", () => {
    for (const query of ["bejaia", "BÉJAÏA", "بجاية", "bgayet", "0601"])
      expect(findPlaces(units, query, "fr").map((x) => x.id)).toContain("c1");
    expect(findPlaces(units, "   ", "ar")).toEqual([]);
    const many = Array.from({ length: 20 }, (_, i) => ({
      ...commune,
      id: `c${i}`,
      code: String(i).padStart(2, "0"),
    }));
    expect(findPlaces(many, "bejaia", "fr")).toHaveLength(12);
    expect(findPlaces(many, "bejaia", "fr")).toEqual(
      findPlaces([...many].reverse(), "bejaia", "fr"),
    );
  });
  it("uses only nearby communes and rejects invalid, distant or implausible GPS", () => {
    expect(nearestPlace(units, 36.751, 5.081)?.id).toBe("c1");
    for (const [lat, lon] of [
      [NaN, 5],
      [91, 5],
      [48.85, 2.35],
      [0, 0],
      [24, 8],
    ])
      expect(nearestPlace(units, lat!, lon!)).toBeNull();
    expect(nearestPlace([wilaya], wilaya.lat, wilaya.lon)).toBeNull();
  });
});
