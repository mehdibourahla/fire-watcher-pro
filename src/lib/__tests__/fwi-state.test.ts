import { describe, expect, it } from "vitest";

import type { DailyBlock } from "@/lib/ingest/weather.server";
import { percentileFor, seriesFwi } from "@/lib/ingest/weather.server";

// Field names match the Open-Meteo `daily` block the pipeline actually requests.
function block(days: number, offset = 0): DailyBlock {
  const time: string[] = [];
  const t: number[] = [];
  const rh: number[] = [];
  const wind: number[] = [];
  const dir: number[] = [];
  const rain: number[] = [];
  for (let i = 0; i < days; i += 1) {
    // keyed on the absolute day so any window over the same dates is identical
    const k = offset + i;
    time.push(new Date(Date.UTC(2026, 4, 1 + k)).toISOString().slice(0, 10));
    t.push(24 + (k % 11));
    rh.push(20 + ((k * 3) % 40));
    wind.push(8 + ((k * 5) % 25));
    dir.push((k * 17) % 360);
    rain.push(k % 9 === 0 ? 4 : 0);
  }
  return {
    time,
    temperature_2m_max: t,
    relative_humidity_2m_min: rh,
    wind_speed_10m_max: wind,
    wind_direction_10m_dominant: dir,
    precipitation_sum: rain,
  };
}

describe("seriesFwi", () => {
  it("emits one entry per forecast day and carries the last observed day", () => {
    const { days, carried } = seriesFwi(block(30), 0);
    expect(days).toHaveLength(6);
    expect(carried).not.toBeNull();
    // carried is the last past day, i.e. the one before the forecast window
    expect(carried!.date).toBe(block(30).time[30 - 7]);
  });

  it("resuming from stored state matches a continuous run", () => {
    const total = 40;
    const continuous = seriesFwi(block(total), 0);

    // carried sits at index len-7, so a 39-day run holds state as of d32;
    // resuming then needs d33 as its single past day plus the 6 forecast days
    const upTo = seriesFwi(block(total - 1), 0);
    expect(upTo.carried!.date).toBe(block(total).time[total - 8]);
    const resumed = seriesFwi(block(7, total - 7), 0, {
      ffmc: upTo.carried!.ffmc,
      dmc: upTo.carried!.dmc,
      dc: upTo.carried!.dc,
    });

    expect(resumed.days).toHaveLength(6);
    for (let i = 0; i < 6; i += 1) {
      expect(resumed.days[i]!.date).toBe(continuous.days[i]!.date);
      expect(resumed.days[i]!.fwi).toBeCloseTo(continuous.days[i]!.fwi, 6);
      expect(resumed.days[i]!.level).toBe(continuous.days[i]!.level);
    }
  });

  it("a cold start understates the drought code versus a converged run", () => {
    const short = seriesFwi(block(9), 0);
    const long = seriesFwi(block(98), 0);
    expect(long.carried!.dc).toBeGreaterThan(short.carried!.dc * 3);
  });

  it("applies the spec 9.3 wind-driven bump only in forested terrain", () => {
    // moderate fuel dryness keeps the base level below 5, where a bump is visible
    const windy = block(12);
    windy.wind_speed_10m_max = windy.wind_speed_10m_max.map(() => 35);
    const bare = seriesFwi(windy, 0);
    const forest = seriesFwi(windy, 0.6);
    for (let i = 0; i < bare.days.length; i += 1) {
      expect(forest.days[i]!.fwi).toBeCloseTo(bare.days[i]!.fwi, 6);
      expect(forest.days[i]!.level).toBeGreaterThanOrEqual(bare.days[i]!.level);
    }
    expect(
      forest.days.some(
        (d: { level: number }, i: number) => d.level > bare.days[i]!.level,
      ),
    ).toBe(true);
  });
});

describe("percentileFor", () => {
  const flat = Array.from({ length: 101 }, (_, i) => i);

  it("returns the exact rank for a value on a breakpoint", () => {
    expect(percentileFor(flat, 0)).toBe(0);
    expect(percentileFor(flat, 50)).toBe(50);
    expect(percentileFor(flat, 100)).toBe(100);
  });

  it("interpolates and rounds between two breakpoints", () => {
    expect(percentileFor(flat, 50.4)).toBe(50);
    expect(percentileFor(flat, 50.6)).toBe(51);
  });

  it("clamps a value outside the observed range instead of extrapolating", () => {
    expect(percentileFor(flat, -5)).toBe(0);
    expect(percentileFor(flat, 500)).toBe(100);
  });

  it("returns null when the breakpoints are not a valid 101-point table", () => {
    expect(percentileFor([1, 2, 3], 2)).toBeNull();
    expect(percentileFor([], 2)).toBeNull();
  });

  it("handles a commune whose FWI never varies on that calendar day", () => {
    const constant = Array.from({ length: 101 }, () => 12);
    expect(percentileFor(constant, 12)).toBe(100);
    expect(percentileFor(constant, 5)).toBe(0);
  });
});
