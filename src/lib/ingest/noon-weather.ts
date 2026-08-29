import type { DailyBlock } from "./weather.server";

export type HourlyBlock = {
  time: string[];
  temperature_2m: number[];
  relative_humidity_2m: number[];
  wind_speed_10m: number[];
  wind_direction_10m: number[];
  precipitation: number[];
};

const NOON_HOUR = 12;

/**
 * The CFFDRS inputs are the noon local standard time observation plus the rainfall
 * of the preceding 24 hours (cffdrs reference implementation). Africa/Algiers keeps
 * UTC+1 all year, so local time is already LST. Open-Meteo's hourly precipitation
 * covers the hour STARTING at its timestamp — verified against precipitation_sum —
 * so noon-to-noon is the slots labelled 12:00 yesterday through 11:00 today.
 */
export function dailyFromHourly(hourly: HourlyBlock): DailyBlock {
  const index = new Map<string, number>();
  hourly.time.forEach((t, i) => index.set(t, i));

  const days = [...new Set(hourly.time.map((t) => t.slice(0, 10)))].sort();
  const out: DailyBlock = {
    time: [],
    temperature_2m_max: [],
    relative_humidity_2m_min: [],
    wind_speed_10m_max: [],
    wind_direction_10m_dominant: [],
    precipitation_sum: [],
  };

  const at = (day: string, hour: number) =>
    index.get(`${day}T${String(hour).padStart(2, "0")}:00`);

  for (const day of days) {
    const noon = at(day, NOON_HOUR);
    if (noon === undefined) continue;
    const temp = hourly.temperature_2m[noon];
    const rh = hourly.relative_humidity_2m[noon];
    const wind = hourly.wind_speed_10m[noon];
    const dir = hourly.wind_direction_10m[noon];
    // a missing observation is dropped, never substituted: an invented noon would
    // advance the stateful codes with a value nobody measured
    if (
      temp == null ||
      rh == null ||
      wind == null ||
      !Number.isFinite(temp) ||
      !Number.isFinite(rh) ||
      !Number.isFinite(wind)
    )
      continue;

    let rain = 0;
    for (let back = 1; back <= 24; back += 1) {
      const slot = noon - back;
      if (slot < 0) break;
      const v = hourly.precipitation[slot];
      if (v != null && Number.isFinite(v)) rain += v;
    }

    out.time.push(day);
    out.temperature_2m_max.push(temp);
    out.relative_humidity_2m_min.push(rh);
    out.wind_speed_10m_max.push(wind);
    out.wind_direction_10m_dominant.push(
      dir != null && Number.isFinite(dir) ? dir : 0,
    );
    out.precipitation_sum.push(Math.round(rain * 100) / 100);
  }

  return out;
}
