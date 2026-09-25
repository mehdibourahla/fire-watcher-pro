import { describe, expect, it } from "vitest";

import { zoneStatus, type LiveContext } from "@/lib/zone-status";

const NOW = Date.parse("2026-09-25T12:00:00Z");
const area = {
  lat: 36.7,
  lon: 4.05,
  radius_km: 10,
  commune_id: "c1",
  communeCode: "1501",
  wilayaId: "w15",
};
const all = { weather: true, official: true, road: true };

const context: LiveContext = {
  weather: [
    {
      id: "a",
      event: "Thunderstorm",
      severity: "Moderate",
      expires: "2026-09-25T18:00:00Z",
      wilaya_id: "w15",
      polygon: null,
    },
    {
      id: "b",
      event: "Thunderstorm",
      severity: "Moderate",
      expires: "2026-09-25T21:00:00Z",
      wilaya_id: "w15",
      polygon: null,
    },
    {
      id: "far",
      event: "Rain",
      severity: "Severe",
      expires: "2026-09-25T21:00:00Z",
      wilaya_id: "w15",
      polygon: [
        [0, 30],
        [0.1, 30],
        [0.1, 30.1],
        [0, 30],
      ],
    },
  ],
  official: [
    {
      id: "o1",
      commune_id: "c1",
      wilaya_id: "w15",
      last_reported_at: "2026-09-24T12:00:00Z",
    },
    {
      id: "old",
      commune_id: "c1",
      wilaya_id: "w15",
      last_reported_at: "2026-09-21T12:00:00Z",
    },
  ],
  road: [
    {
      id: "r1",
      area_id: "w15",
      summary: "Accident RN12",
      expires_at: "2026-09-25T20:00:00Z",
    },
    {
      id: "r2",
      area_id: "w15",
      summary: "gone",
      expires_at: "2026-09-25T10:00:00Z",
    },
  ],
};

describe("zoneStatus", () => {
  it("lists what is active now under the alert engine's own matching rules", () => {
    expect(zoneStatus(all, area, context, NOW)).toEqual({
      weather: [{ event: "storm", level: 2, until: "2026-09-25T21:00:00Z" }],
      official: 1,
      road: [{ id: "r1", summary: "Accident RN12" }],
    });
  });

  it("shows only the hazards the zone follows", () => {
    expect(
      zoneStatus(
        { weather: false, official: true, road: false },
        area,
        context,
        NOW,
      ),
    ).toEqual({ weather: [], official: 1, road: [] });
  });
});
