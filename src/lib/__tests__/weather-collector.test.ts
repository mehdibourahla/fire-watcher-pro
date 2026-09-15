import { expect, it, vi } from "vitest";
import fixture from "./fixtures/openmeteo-weather.json";
import type { ClaimedSourceJob } from "../source-jobs";
import { collectWeatherEvidence } from "../ingest/weather-evidence.server";
import { createArchivedFetch } from "../source-archive.server";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
const now = new Date(fixture.hourly.time[0]! * 1000 + 1800000);
const job = {
  scheduled_for: now.toISOString(),
  id: "job",
  attempt_count: 1,
} as ClaimedSourceJob;
const location = { id: "commune", lat: 34.67, lon: 3.25 };

it("collects without ONM and persists complete forecasts with source identity", async () => {
  const save = vi.fn().mockResolvedValue(1);
  const capture = vi.fn().mockResolvedValue(undefined);
  const archive = createArchivedFetch({ putObject: async () => {}, capture });
  const fetch = vi.fn<typeof archive>(
    (source, endpoint, input, init, options) =>
      archive(source, endpoint, input, init, {
        ...options,
        fetchImpl: async () => Response.json(fixture),
      }),
  );
  const result = await collectWeatherEvidence(job, {
    locations: async () => [location],
    fetch,
    save,
    pause: async () => {},
    now: () => now,
  });
  expect(result).toMatchObject({ accepted: 1, inserted: 1, rejected: 0 });
  expect(save.mock.calls[0]?.[0][0]).toMatchObject({
    commune_id: "commune",
    evidence: { source: "open-meteo", scheduledAt: job.scheduled_for },
  });
  expect(String(fetch.mock.calls[0]?.[2])).toContain("forecast_hours=48");
  expect(fetch.mock.calls[0]?.[4]).toEqual({
    requestParams: {
      latitude: "34.67",
      longitude: "3.25",
      forecast_hours: "48",
      timezone: "UTC",
      timeformat: "unixtime",
      models: "best_match",
      hourly:
        "precipitation,rain,showers,precipitation_probability,weather_code,wind_gusts_10m,cape",
    },
  });
  expect(capture).toHaveBeenCalledWith(
    expect.objectContaining({
      source_key: "openmeteo_weather",
      source_origin: "https://api.open-meteo.com",
      request_params: fetch.mock.calls[0]![4]!.requestParams,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    }),
  );
});

it("paces fast multi-location batches below the per-location minute quota", async () => {
  let elapsed = 0;
  const times: number[] = [];
  await collectWeatherEvidence(job, {
    locations: async () =>
      Array.from({ length: 500 }, (_, i) => ({ ...location, id: String(i) })),
    fetch: async () => {
      times.push(elapsed);
      return Response.json(Array(25).fill(fixture));
    },
    save: async (rows) => rows.length,
    pause: async (ms) => {
      elapsed += ms;
    },
    now: () => new Date(now.getTime() + elapsed),
  });
  expect(times).toHaveLength(20);
  expect(elapsed).toBeGreaterThanOrEqual(76000);
  for (const time of times) {
    const locationsInWindow =
      times.filter((t) => t >= time && t < time + 60000).length * 25;
    expect(locationsInWindow).toBeLessThanOrEqual(375);
  }
});

it("keeps complete locations when a later batch is rate limited and stops upstream requests", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(Array(25).fill(fixture)))
    .mockResolvedValueOnce(new Response("limited", { status: 429 }));
  const save = vi.fn().mockResolvedValue(25);
  const result = await collectWeatherEvidence(job, {
    locations: async () =>
      Array.from({ length: 60 }, (_, i) => ({ ...location, id: String(i) })),
    fetch,
    save,
    pause: async () => {},
    now: () => now,
  });
  expect(result).toMatchObject({
    accepted: 25,
    rejected: 35,
    expected: 60,
    error: "open-meteo weather HTTP 429",
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenCalledTimes(1);
});

it("does not publish malformed location data or pretend it has zero rain", async () => {
  const save = vi.fn();
  const result = await collectWeatherEvidence(job, {
    locations: async () => [location],
    fetch: vi.fn().mockResolvedValue(Response.json({ ...fixture, hourly: {} })),
    save,
    pause: async () => {},
    now: () => now,
  });
  expect(result.accepted).toBe(0);
  expect(result.rejected).toBe(1);
  expect(save).not.toHaveBeenCalled();
});
