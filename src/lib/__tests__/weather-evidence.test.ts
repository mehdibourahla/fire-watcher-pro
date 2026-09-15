import { describe, expect, it } from "vitest";
import fixture from "./fixtures/openmeteo-weather.json";
import { parseWeatherEvidence, weatherIsStale } from "../weather-evidence";

const identity = {
  fetchedAt: new Date(fixture.hourly.time[0]! * 1000 + 1800000).toISOString(),
  scheduledAt: new Date(fixture.hourly.time[0]! * 1000).toISOString(),
  requested: { lat: 34.67, lon: 3.25 },
};

describe("hourly weather evidence", () => {
  it("retains forecast grid and preceding-hour timestamps from real upstream data", () => {
    const evidence = parseWeatherEvidence(fixture, identity);
    expect(evidence.hours).toHaveLength(48);
    expect(evidence.grid.lat).toBe(fixture.latitude);
    expect(evidence.hours[0]?.time).toBe(identity.scheduledAt);
    expect(evidence.hours[0]?.rainMm).toBe(
      fixture.hourly.rain[0]! + fixture.hourly.showers[0]!,
    );
  });
  it("preserves missing observations without converting them into zero danger", () => {
    const input = structuredClone(fixture) as unknown as {
      hourly: Record<string, (number | null)[]>;
    };
    input.hourly["precipitation"]![0] = null;
    input.hourly["showers"]![0] = null;
    input.hourly["weather_code"]![0] = null;
    const result = parseWeatherEvidence(input, identity);
    expect(result.hours[0]?.precipitationMm).toBeNull();
    expect(result.hours[0]?.rainMm).toBeNull();
    expect(result.hours[0]?.weatherCode).toBeNull();
  });
  it("rejects partial arrays, invalid units, shifted grids and missing hours", () => {
    const partial = structuredClone(fixture);
    partial.hourly.precipitation.pop();
    expect(() => parseWeatherEvidence(partial, identity)).toThrow();
    const units = structuredClone(fixture);
    units.hourly_units.precipitation = "inch";
    expect(() => parseWeatherEvidence(units, identity)).toThrow();
    expect(() =>
      parseWeatherEvidence({ ...fixture, latitude: 40 }, identity),
    ).toThrow();
    const gap = structuredClone(fixture);
    gap.hourly.time[4]! += 3600;
    expect(() => parseWeatherEvidence(gap, identity)).toThrow();
  });
  it("marks old evidence stale and never treats a missing timestamp as fresh", () => {
    const evidence = parseWeatherEvidence(fixture, identity);
    expect(weatherIsStale(evidence, Date.parse(identity.fetchedAt))).toBe(
      false,
    );
    expect(
      weatherIsStale(evidence, Date.parse(identity.fetchedAt) + 8 * 3600000),
    ).toBe(true);
    expect(weatherIsStale({ ...evidence, fetchedAt: "bad" })).toBe(true);
  });
});
