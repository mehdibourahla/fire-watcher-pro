import { queryOptions } from "@tanstack/react-query";

export const WHO_PM25_24H = 15;

export type SmokeLevel = "low" | "elevated" | "high" | "severe";

export const SMOKE_TINT: Record<SmokeLevel, number> = {
  low: 1,
  elevated: 2,
  high: 3,
  severe: 5,
};

export type AirQualityReading = {
  pm2_5: number;
  pm10: number;
  dust: number;
  peakPm25: number;
  observedAt: string;
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function parseAirQuality(response: unknown): AirQualityReading | null {
  if (typeof response !== "object" || response === null) return null;
  const { current, hourly } = response as {
    current?: Record<string, unknown>;
    hourly?: { pm2_5?: unknown };
  };
  if (!current) return null;
  const pm2_5 = num(current["pm2_5"]);
  const pm10 = num(current["pm10"]);
  const dust = num(current["dust"]);
  const time = current["time"];
  if (
    pm2_5 === null ||
    pm10 === null ||
    dust === null ||
    typeof time !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time)
  )
    return null;
  const observedAt = `${time}:00Z`;
  if (Number.isNaN(Date.parse(observedAt))) return null;
  const series = Array.isArray(hourly?.pm2_5) ? hourly.pm2_5 : [];
  let peakPm25 = pm2_5;
  for (const v of series) {
    const n = num(v);
    if (n !== null && n > peakPm25) peakPm25 = n;
  }
  return { pm2_5, pm10, dust, peakPm25, observedAt };
}

// Bands are the WHO 2021 guideline (15) and its interim targets IT-3 (37.5) and IT-1 (75).
export function smokeLevel(pm25: number): SmokeLevel {
  if (pm25 < WHO_PM25_24H) return "low";
  if (pm25 < 37.5) return "elevated";
  if (pm25 < 75) return "high";
  return "severe";
}

export function airQualityUrl(lat: number, lon: number): string {
  return `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm2_5,pm10,dust&hourly=pm2_5&forecast_days=1&timezone=UTC`;
}

export function airQualityQuery(position: { lat: number; lon: number } | null) {
  // Keyed at ~100 m so GPS jitter does not refetch; the model is hourly anyway.
  const key = position
    ? [position.lat.toFixed(3), position.lon.toFixed(3)]
    : null;
  return queryOptions({
    queryKey: ["air-quality", key],
    enabled: position !== null,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      if (!position) throw new Error("air quality needs a position");
      const res = await fetch(airQualityUrl(position.lat, position.lon));
      if (!res.ok) throw new Error(`open-meteo air quality ${res.status}`);
      const reading = parseAirQuality(await res.json());
      if (!reading) throw new Error("open-meteo air quality: unreadable body");
      return reading;
    },
  });
}

export const WHO_PM10_24H = 45;

// WHO 2021 PM10 guideline (45) and interim targets IT-3 (75) and IT-1 (150).
export function pm10Level(pm10: number): SmokeLevel {
  if (pm10 < WHO_PM10_24H) return "low";
  if (pm10 < 75) return "elevated";
  if (pm10 < 150) return "high";
  return "severe";
}

export type AirHourly = {
  time: string[];
  pm2_5: (number | null)[];
  pm10: (number | null)[];
};

export function parseAirHourly(response: unknown): AirHourly | null {
  if (typeof response !== "object" || response === null) return null;
  const hourly = (response as { hourly?: Record<string, unknown> }).hourly;
  if (!hourly) return null;
  const { time, pm2_5, pm10 } = hourly;
  if (
    !Array.isArray(time) ||
    !Array.isArray(pm2_5) ||
    !Array.isArray(pm10) ||
    pm2_5.length !== time.length ||
    pm10.length !== time.length ||
    !time.every(
      (t) => typeof t === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t),
    )
  )
    return null;
  return { time, pm2_5: pm2_5.map(num), pm10: pm10.map(num) };
}

export function airForecastUrl(lat: number, lon: number): string {
  return `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=pm2_5,pm10&forecast_days=6&timezone=Africa%2FAlgiers`;
}

export function airForecastQuery(
  position: { lat: number; lon: number } | null,
) {
  const key = position
    ? [position.lat.toFixed(3), position.lon.toFixed(3)]
    : null;
  return queryOptions({
    queryKey: ["air-forecast", key],
    enabled: position !== null,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      if (!position) throw new Error("air forecast needs a position");
      const res = await fetch(airForecastUrl(position.lat, position.lon));
      if (!res.ok) throw new Error(`open-meteo air forecast ${res.status}`);
      const hourly = parseAirHourly(await res.json());
      if (!hourly) throw new Error("open-meteo air forecast: unreadable body");
      return hourly;
    },
  });
}
