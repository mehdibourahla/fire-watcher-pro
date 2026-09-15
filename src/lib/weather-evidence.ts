import { z } from "zod";

export type WeatherHour = {
  time: string;
  precipitationMm: number | null;
  rainMm: number | null;
  probabilityPercent: number | null;
  weatherCode: number | null;
  gustKmh: number | null;
  cape: number | null;
};

export type WeatherEvidence = {
  source: "open-meteo";
  model: "best_match";
  fetchedAt: string;
  scheduledAt: string;
  requested: { lat: number; lon: number };
  grid: { lat: number; lon: number };
  hours: WeatherHour[];
};

export type WeatherResponse = {
  snapshot: WeatherEvidence | null;
  stale: boolean;
};

const value = z.number().finite().nonnegative().nullable();
const weatherCodes = new Set([
  0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77,
  80, 81, 82, 85, 86, 95, 96, 99,
]);
const upstream = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  hourly_units: z.object({
    time: z.literal("unixtime"),
    precipitation: z.literal("mm"),
    rain: z.literal("mm"),
    showers: z.literal("mm"),
    precipitation_probability: z.literal("%"),
    weather_code: z.literal("wmo code"),
    wind_gusts_10m: z.literal("km/h"),
    cape: z.literal("J/kg").optional(),
  }),
  hourly: z.object({
    time: z.array(z.number().int().positive()).length(48),
    precipitation: z.array(value).length(48),
    rain: z.array(value).length(48),
    showers: z.array(value).length(48),
    precipitation_probability: z
      .array(z.number().min(0).max(100).nullable())
      .length(48),
    weather_code: z
      .array(
        z
          .number()
          .int()
          .refine((n) => weatherCodes.has(n))
          .nullable(),
      )
      .length(48),
    wind_gusts_10m: z.array(value).length(48),
    cape: z.array(value).length(48).optional(),
  }),
});

export function parseWeatherEvidence(
  input: unknown,
  identity: Pick<WeatherEvidence, "fetchedAt" | "scheduledAt" | "requested">,
): WeatherEvidence {
  const data = upstream.parse(input);
  const h = data.hourly;
  const fetched = Date.parse(identity.fetchedAt);
  if (
    !Number.isFinite(fetched) ||
    !Number.isFinite(Date.parse(identity.scheduledAt)) ||
    !Number.isFinite(identity.requested.lat) ||
    !Number.isFinite(identity.requested.lon) ||
    Math.abs(data.latitude - identity.requested.lat) > 0.5 ||
    Math.abs(data.longitude - identity.requested.lon) > 0.5 ||
    Math.abs(h.time[0]! * 1000 - fetched) > 2 * 3600000 ||
    h.time.some((t, i) => i > 0 && t - h.time[i - 1]! !== 3600)
  ) {
    throw new Error("weather response location or time mismatch");
  }
  if (
    !h.precipitation.some((n) => n !== null) &&
    !h.weather_code.some((n) => n !== null)
  ) {
    throw new Error("weather response has no usable forecast");
  }
  return {
    ...identity,
    source: "open-meteo",
    model: "best_match",
    grid: { lat: data.latitude, lon: data.longitude },
    hours: h.time.map((time, i) => ({
      time: new Date(time * 1000).toISOString(),
      precipitationMm: h.precipitation[i]!,
      rainMm:
        h.rain[i] !== null && h.showers[i] !== null
          ? Math.round((h.rain[i]! + h.showers[i]!) * 1000) / 1000
          : null,
      probabilityPercent: h.precipitation_probability[i]!,
      weatherCode: h.weather_code[i]!,
      gustKmh: h.wind_gusts_10m[i]!,
      cape: h.cape?.[i] ?? null,
    })),
  };
}

export function weatherIsStale(
  snapshot: WeatherEvidence,
  now = Date.now(),
): boolean {
  const fetched = Date.parse(snapshot.fetchedAt);
  const last = Date.parse(snapshot.hours.at(-1)?.time ?? "");
  return (
    !Number.isFinite(fetched) ||
    !Number.isFinite(last) ||
    fetched > now + 300000 ||
    now - fetched >= 8 * 3600000 ||
    last <= now
  );
}
