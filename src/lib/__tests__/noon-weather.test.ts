import { describe, expect, it } from "vitest";

import { dailyFromHourly, type HourlyBlock } from "@/lib/ingest/noon-weather";

/** Two full days of hourly data with a marker value at each noon. */
function hours(days: string[], build: (day: string, hour: number) => number) {
  const time: string[] = [];
  const value: number[] = [];
  for (const d of days) {
    for (let h = 0; h < 24; h += 1) {
      time.push(`${d}T${String(h).padStart(2, "0")}:00`);
      value.push(build(d, h));
    }
  }
  return { time, value };
}

const DAYS = ["2026-08-27", "2026-08-28"];

function block(over: Partial<HourlyBlock> = {}): HourlyBlock {
  const t = hours(DAYS, () => 0).time;
  return {
    time: t,
    temperature_2m: hours(DAYS, (_, h) => (h === 12 ? 30 : 45)).value,
    relative_humidity_2m: hours(DAYS, (_, h) => (h === 12 ? 55 : 10)).value,
    wind_speed_10m: hours(DAYS, (_, h) => (h === 12 ? 9 : 40)).value,
    wind_direction_10m: hours(DAYS, (_, h) => (h === 12 ? 180 : 90)).value,
    precipitation: hours(DAYS, () => 0).value,
    ...over,
  };
}

describe("dailyFromHourly", () => {
  it("takes the noon LST value, never the daily extreme", () => {
    const d = dailyFromHourly(block());
    expect(d.temperature_2m_max).toEqual([30, 30]);
    expect(d.relative_humidity_2m_min).toEqual([55, 55]);
    expect(d.wind_speed_10m_max).toEqual([9, 9]);
    expect(d.wind_direction_10m_dominant).toEqual([180, 180]);
  });

  it("accumulates rainfall over the 24 hours ending at noon", () => {
    // 1 mm in each hour from 12:00 on day 1 through 11:00 on day 2
    const precipitation = hours(DAYS, (day, h) =>
      (day === DAYS[0] && h >= 12) || (day === DAYS[1] && h < 12) ? 1 : 0,
    ).value;
    const d = dailyFromHourly(block({ precipitation }));
    expect(d.precipitation_sum[1]).toBe(24);
  });

  it("excludes rain that falls after the noon observation", () => {
    // rain only in the afternoon of day 2 must not reach day 2's index
    const precipitation = hours(DAYS, (day, h) =>
      day === DAYS[1] && h >= 13 ? 5 : 0,
    ).value;
    const d = dailyFromHourly(block({ precipitation }));
    expect(d.precipitation_sum[1]).toBe(0);
  });

  it("drops a day whose noon observation is missing rather than inventing one", () => {
    const temperature_2m = block().temperature_2m.slice();
    temperature_2m[24 + 12] = null as unknown as number;
    const d = dailyFromHourly(block({ temperature_2m }));
    expect(d.time).toEqual([DAYS[0]]);
  });

  it("returns days in ascending order", () => {
    expect(dailyFromHourly(block()).time).toEqual(DAYS);
  });
});
