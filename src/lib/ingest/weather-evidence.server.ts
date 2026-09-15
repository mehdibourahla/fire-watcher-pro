import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { fetchAllPages } from "@/lib/paginate";
import { archivedFetch } from "@/lib/source-archive.server";
import type { ClaimedSourceJob } from "@/lib/source-jobs";
import {
  parseWeatherEvidence,
  type WeatherEvidence,
} from "@/lib/weather-evidence";

type Location = { id: string; lat: number; lon: number };
type SavedWeather = { commune_id: string; evidence: WeatherEvidence };
type Dependencies = {
  locations: () => Promise<Location[]>;
  fetch: typeof archivedFetch;
  save: (rows: SavedWeather[], job: ClaimedSourceJob) => Promise<number>;
  pause: (milliseconds: number) => Promise<void>;
  now: () => Date;
};

const dependencies: Dependencies = {
  locations: () =>
    fetchAllPages<Location>((from, to) =>
      supabaseAdmin
        .from("admin_units")
        .select("id,lat,lon")
        .eq("level", "commune")
        .order("id")
        .range(from, to),
    ),
  fetch: archivedFetch,
  save: async (rows, job) => {
    const { data, error } = await supabaseAdmin.rpc("save_weather_snapshots", {
      _job: job.id,
      _attempt: job.attempt_count,
      _snapshots: rows as unknown as Json,
    });
    if (error)
      throw new Error(`weather snapshot save failed: ${error.message}`);
    return data ?? 0;
  },
  pause: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now: () => new Date(),
};

export async function collectWeatherEvidence(
  job: ClaimedSourceJob,
  deps = dependencies,
) {
  const scheduled = Date.parse(job.scheduled_for);
  if (
    !Number.isFinite(scheduled) ||
    deps.now().getTime() - scheduled > 6 * 3600000
  ) {
    throw new Error("weather scheduled slot expired");
  }
  const targets = await deps.locations();
  if (!targets.length) throw new Error("weather locations unavailable");
  const locations = targets.filter(
    ({ lat, lon }) =>
      Number.isFinite(lat) &&
      lat >= -90 &&
      lat <= 90 &&
      Number.isFinite(lon) &&
      lon >= -180 &&
      lon <= 180,
  );
  let accepted = 0;
  let inserted = 0;
  let rejected = targets.length - locations.length;
  let failure: string | undefined = rejected
    ? "weather location coordinates invalid"
    : undefined;
  for (let offset = 0; offset < locations.length; offset += 25) {
    const batch = locations.slice(offset, offset + 25);
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", batch.map((l) => l.lat).join(","));
    url.searchParams.set("longitude", batch.map((l) => l.lon).join(","));
    url.searchParams.set(
      "hourly",
      "precipitation,rain,showers,precipitation_probability,weather_code,wind_gusts_10m,cape",
    );
    url.searchParams.set("forecast_hours", "48");
    url.searchParams.set("timezone", "UTC");
    url.searchParams.set("timeformat", "unixtime");
    url.searchParams.set("models", "best_match");
    const response = await deps.fetch(
      "openmeteo_weather",
      "hourly_forecast",
      url,
      { signal: AbortSignal.timeout(30000) },
      { requestParams: Object.fromEntries(url.searchParams) },
    );
    if (!response.ok) {
      failure = `open-meteo weather HTTP ${response.status}`;
      rejected += batch.length;
      break;
    }
    const raw: unknown = await response.json();
    const list = Array.isArray(raw) ? raw : [raw];
    if (list.length !== batch.length)
      throw new Error("weather batch length mismatch");
    const fetchedAt = deps.now().toISOString();
    const rows: SavedWeather[] = [];
    for (const [i, location] of batch.entries()) {
      try {
        rows.push({
          commune_id: location.id,
          evidence: parseWeatherEvidence(list[i], {
            fetchedAt,
            scheduledAt: job.scheduled_for,
            requested: { lat: location.lat, lon: location.lon },
          }),
        });
      } catch {
        rejected++;
        failure = "weather response schema or coverage invalid";
      }
    }
    if (rows.length) {
      inserted += await deps.save(rows, job);
      accepted += rows.length;
    }
    // Each coordinate counts against the upstream per-minute quota.
    if (offset + 25 < locations.length) await deps.pause(4000);
  }
  return {
    expected: targets.length,
    accepted,
    inserted,
    rejected,
    error: failure,
  };
}
