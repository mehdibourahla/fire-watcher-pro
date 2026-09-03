import { describe, expect, it } from "vitest";

import { smokeLevel, parseAirQuality, WHO_PM25_24H } from "@/lib/air-quality";

/* Open-Meteo's CAMS-backed air-quality response, trimmed. Recorded 2026-09-03 for
 * Bejaia; the fire-season peak measured on 2026-08-29 beside a live fire was 837 µg/m³. */
const response = {
  current: {
    time: "2026-09-03T00:00",
    interval: 3600,
    pm2_5: 12.1,
    pm10: 27.5,
    dust: 12,
  },
  current_units: { pm2_5: "μg/m³", pm10: "μg/m³", dust: "μg/m³" },
  hourly: {
    time: ["2026-09-03T00:00", "2026-09-03T01:00", "2026-09-03T02:00"],
    pm2_5: [12.1, 19.8, null],
  },
};

describe("parseAirQuality", () => {
  it("reads the current reading with its own timestamp and the day's peak", () => {
    const reading = parseAirQuality(response);
    expect(reading).toEqual({
      pm2_5: 12.1,
      pm10: 27.5,
      dust: 12,
      peakPm25: 19.8,
      observedAt: "2026-09-03T00:00:00Z",
    });
  });

  it("returns null rather than inventing a reading when the field is missing", () => {
    expect(
      parseAirQuality({ current: { time: "2026-09-03T00:00" } }),
    ).toBeNull();
    expect(parseAirQuality({})).toBeNull();
  });
});

describe("smokeLevel", () => {
  it("bands against the WHO 24-hour guideline, which is 15", () => {
    expect(WHO_PM25_24H).toBe(15);
    expect(smokeLevel(9)).toBe("low");
    expect(smokeLevel(15)).toBe("elevated");
    expect(smokeLevel(60)).toBe("high");
    expect(smokeLevel(200)).toBe("severe");
  });

  it("has no band that reads as an all-clear", () => {
    for (const level of [smokeLevel(0), smokeLevel(1000)])
      expect(["low", "elevated", "high", "severe"]).toContain(level);
  });
});
