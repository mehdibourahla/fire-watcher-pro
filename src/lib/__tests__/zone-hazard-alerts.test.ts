import { describe, expect, it } from "vitest";

import {
  hazardAlerts,
  type HazardContext,
  type HazardZone,
} from "@/lib/zone-hazard-alerts";

const zone: HazardZone = {
  id: "z1",
  user_id: "u1",
  name: "Home",
  lat: 36.6,
  lon: 3.1,
  radius_km: 5,
  commune_id: "c1",
  notify_weather: true,
  notify_official: true,
  notify_road: true,
};

const context: HazardContext = {
  communes: new Map([["c1", { code: "1601", wilayaId: "w16" }]]),
  weather: [
    {
      id: "onm1",
      severity: "Moderate",
      title: "Thunderstorm Moderate warning for the wilaya: ALGER",
      headline_fr: "Orages modérés sur Alger",
      polygon: null,
      wilaya_id: "w16",
      expires: "2026-09-25T18:00:00Z",
    },
  ],
  official: [
    {
      id: "dgpc1",
      commune_id: null,
      wilaya_id: "w16",
      place_text: "Alger",
      last_reported_at: "2026-09-24T10:00:00Z",
    },
  ],
  authority: [
    {
      id: "auth1",
      source: "Protection Civile",
      body: "Évacuez la route forestière",
      severity: "Severe",
      wilaya_id: "w16",
      commune_codes: null,
      created_at: "2026-09-24T09:00:00Z",
    },
  ],
  road: [
    {
      id: "road1",
      summary: "RN5 fermée à Bab Ezzouar",
      area_id: "c1",
      source_name: "Info Trafic Algérie",
      expires_at: "2026-09-26T09:00:00Z",
    },
  ],
};

const awake = () => ({ locale: "fr", quiet: false });

describe("hazardAlerts", () => {
  it("raises one alert per matching hazard with a stable key and its source", () => {
    const { rows } = hazardAlerts([zone], context, awake);
    expect(rows.map((r) => [r.kind, r.dedupe_key, r.source_table])).toEqual([
      ["weather", "weather:z1:onm1", "onm_vigilance"],
      ["official", "official:z1:dgpc1", "official_incidents"],
      ["official", "official:z1:auth1", "authority_warnings"],
      ["road", "road:z1:road1", "civil_publications"],
    ]);
  });

  it("respects each zone switch", () => {
    const { rows } = hazardAlerts(
      [{ ...zone, notify_weather: false, notify_road: false }],
      context,
      awake,
    );
    expect(rows.map((r) => r.kind)).toEqual(["official", "official"]);
  });

  it("holds back road and moderate weather in quiet hours, never official warnings", () => {
    const { rows, suppressed } = hazardAlerts([zone], context, () => ({
      locale: "fr",
      quiet: true,
    }));
    expect(rows.map((r) => r.kind)).toEqual(["official", "official"]);
    expect(suppressed).toBe(2);
  });

  it("lets an Extreme ONM warning through quiet hours", () => {
    const extreme = {
      ...context,
      weather: [{ ...context.weather[0]!, severity: "Extreme" }],
    };
    const { rows } = hazardAlerts([zone], extreme, () => ({
      locale: "fr",
      quiet: true,
    }));
    expect(rows.some((r) => r.kind === "weather" && r.severity === 4)).toBe(
      true,
    );
  });

  it("quotes ONM's own wording with attribution", () => {
    const { rows } = hazardAlerts([zone], context, awake);
    const weather = rows.find((r) => r.kind === "weather")!;
    expect(weather.body).toContain("ONM");
    expect(weather.body).toContain("Orages modérés sur Alger");
  });

  it("presents a road item as reviewed information, not an order", () => {
    const { rows } = hazardAlerts([zone], context, () => ({
      locale: "en",
      quiet: false,
    }));
    const road = rows.find((r) => r.kind === "road")!;
    expect(road.body).toContain("RN5 fermée à Bab Ezzouar");
    expect(road.body).toContain("Info Trafic Algérie");
  });

  it("skips hazards that do not concern the zone", () => {
    const elsewhere = {
      ...zone,
      commune_id: "c9",
    };
    const { rows } = hazardAlerts(
      [elsewhere],
      {
        ...context,
        communes: new Map([["c9", { code: "0901", wilayaId: "w09" }]]),
      },
      awake,
    );
    expect(rows).toEqual([]);
  });

  it("records when each hazard stops being current and where it sits on the map", () => {
    const { rows } = hazardAlerts([zone], context, awake);
    expect(
      rows.map((r) => [r.payload["expires_at"], r.payload["map_event"]]),
    ).toEqual([
      ["2026-09-25T18:00:00Z", "weather:onm1"],
      ["2026-09-27T10:00:00.000Z", "official:dgpc1"],
      ["2026-09-25T09:00:00.000Z", undefined],
      ["2026-09-26T09:00:00Z", "civil:road1"],
    ]);
  });
});
