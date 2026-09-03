import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchAllPages } from "@/lib/paginate";

import { isFuelLimited, type LandcoverFractions } from "@/lib/zonal";

import { dailyFromHourly, type HourlyBlock } from "./noon-weather";
import {
  FWI_START,
  computeFwi,
  dangerFromFwi,
  nextDc,
  nextDmc,
  nextFfmc,
} from "./fwi";

const HORIZON_DAYS = 6;
const SPINUP_DAYS = 92;
const BATCH = 25;
const RETRY_LIMIT = 5;
const RETRY_BASE_MS = 2000;
const INTER_BATCH_MS = 1200;
const STALE_STATE_DAYS = 60;
// bump when the weather inputs change so stored codes are rebuilt, not resumed
const FWI_INPUTS = "noon_lst";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type DailyBlock = {
  time: string[];
  temperature_2m_max: number[];
  relative_humidity_2m_min: number[];
  wind_speed_10m_max: number[];
  wind_direction_10m_dominant: number[];
  precipitation_sum: number[];
};

type OpenMeteoResponse =
  { hourly?: HourlyBlock } | Array<{ hourly?: HourlyBlock }>;

export type RiskRun = {
  communes: number;
  rows: number;
  requests?: number;
  error?: string;
  publishedAt?: string;
  superseded?: boolean;
};

export type RiskRefreshIdentity = {
  snapshotId: string;
  baseDate: string;
  scheduledFor: string;
};

async function fetchDaily(
  lats: number[],
  lons: number[],
  pastDays: number,
): Promise<(DailyBlock | null)[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lats.join(","));
  url.searchParams.set("longitude", lons.join(","));
  // CFFDRS is defined on the noon LST observation, not the day's extremes, so the
  // hourly series is fetched and reduced in dailyFromHourly. Daily aggregates put
  // the index on a hotter, drier, windier day than the one that was observed.
  url.searchParams.set(
    "hourly",
    "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation",
  );
  // an extra past day supplies the 24h-to-noon rainfall for the first day used
  // DC has a ~52-day time constant, so a short spin-up leaves the drought codes
  // far below reality; 92 days of observed weather converges them each run.
  url.searchParams.set("past_days", String(pastDays + 1));
  url.searchParams.set("forecast_days", String(HORIZON_DAYS));
  url.searchParams.set("timezone", "Africa/Algiers");

  // Open-Meteo weights a call by locations x days, so 1500+ communes trip the
  // free-tier limit long before the request count looks high.
  let lastStatus = 0;
  for (let attempt = 0; attempt < RETRY_LIMIT; attempt += 1) {
    const res = await fetch(url);
    if (res.ok) {
      const json = (await res.json()) as OpenMeteoResponse;
      const list = Array.isArray(json) ? json : [json];
      return lats.map((_, i) => {
        const hourly = list[i]?.hourly;
        return hourly ? dailyFromHourly(hourly) : null;
      });
    }
    lastStatus = res.status;
    if (res.status !== 429 && res.status < 500) break;
    const retryAfter = Number(res.headers.get("retry-after"));
    const backoff =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : RETRY_BASE_MS * 2 ** attempt;
    await sleep(backoff + Math.random() * 500);
  }
  throw new Error(`open-meteo ${lastStatus}`);
}

export type StoredState = {
  date: string;
  ffmc: number;
  dmc: number;
  dc: number;
};

/**
 * Advance the FWI codes across every returned day, then project the horizon.
 * `initial` is yesterday's stored state; without one the caller must request a
 * long enough window for the codes to converge from the standard defaults.
 */
export function seriesFwi(
  daily: DailyBlock,
  forestFraction: number,
  initial?: { ffmc: number; dmc: number; dc: number },
) {
  let state = { ...(initial ?? FWI_START) };
  let carried: StoredState | null = null;
  const out: {
    date: string;
    fwi: number;
    level: number;
    components: Record<string, number>;
  }[] = [];
  const total = daily.time.length;
  const spinUp = Math.max(0, total - HORIZON_DAYS);

  for (let i = 0; i < total; i += 1) {
    const date = daily.time[i]!;
    const temp = daily.temperature_2m_max[i] ?? 25;
    const rh = Math.min(
      100,
      Math.max(1, daily.relative_humidity_2m_min[i] ?? 40),
    );
    const wind = Math.max(0, daily.wind_speed_10m_max[i] ?? 10);
    const rain = Math.max(0, daily.precipitation_sum[i] ?? 0);
    const month = Number(date.slice(5, 7));

    state = {
      ffmc: nextFfmc(state.ffmc, temp, rh, wind, rain),
      dmc: nextDmc(state.dmc, temp, rh, rain, month),
      dc: nextDc(state.dc, temp, rain, month),
    };
    if (i === spinUp - 1) {
      carried = {
        date,
        ffmc: state.ffmc,
        dmc: state.dmc,
        dc: state.dc,
      };
    }
    if (i < spinUp) continue;

    const { isi, bui, fwi } = computeFwi(state.ffmc, state.dmc, state.dc, wind);
    // spec 9.3: report FWI as computed, then bump one level for wind-driven
    // risk in forested terrain. The previous multiplicative damping had no basis
    // in the spec and understated every commune whose forest fraction is unknown.
    const windDriven = forestFraction > 0.4 && wind > 30;
    const level = Math.min(5, dangerFromFwi(fwi) + (windDriven ? 1 : 0));
    out.push({
      date,
      fwi: Math.round(fwi * 10) / 10,
      level,
      components: {
        ffmc: Math.round(state.ffmc * 10) / 10,
        dmc: Math.round(state.dmc * 10) / 10,
        dc: Math.round(state.dc * 10) / 10,
        isi: Math.round(isi * 10) / 10,
        bui: Math.round(bui * 10) / 10,
        temp_c: Math.round(temp * 10) / 10,
        rh_pct: Math.round(rh),
        wind_kmh: Math.round(wind),
        wind_driven: windDriven ? 1 : 0,
        wind_dir_deg: Math.round(daily.wind_direction_10m_dominant[i] ?? 0),
        rain_mm: Math.round(rain * 10) / 10,
      },
    });
  }
  return { days: out, carried };
}

export async function refreshRiskForecasts({
  snapshotId,
  baseDate,
  scheduledFor,
}: RiskRefreshIdentity): Promise<RiskRun> {
  const staleBefore = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { error: startError } = await supabaseAdmin.rpc(
    "begin_risk_forecast_snapshot",
    {
      _snapshot_id: snapshotId,
      _base_date: baseDate,
      _scheduled_for: scheduledFor,
      _stale_before: staleBefore,
    },
  );
  if (startError)
    return {
      communes: 0,
      rows: 0,
      error: `risk snapshot start failed: ${startError.message}`,
    };

  const discard = async () => {
    const { error } = await supabaseAdmin.rpc(
      "discard_risk_forecast_snapshot",
      {
        _snapshot_id: snapshotId,
        _base_date: baseDate,
        _scheduled_for: scheduledFor,
      },
    );
    return error;
  };

  const communes = await fetchAllPages<{
    id: string;
    lat: number;
    lon: number;
    forest_fraction: number | null;
    landcover: LandcoverFractions | null;
  }>((from, to) =>
    supabaseAdmin
      .from("admin_units")
      .select("id, lat, lon, forest_fraction, landcover")
      .eq("level", "commune")
      .range(from, to),
  );
  if (!communes.length) {
    await discard();
    return { communes: 0, rows: 0 };
  }

  const stored = new Map<string, StoredState>();
  for (const row of await fetchAllPages<StoredState & { commune_id: string }>(
    (from, to) =>
      supabaseAdmin
        .from("fwi_state")
        .select("commune_id, date, ffmc, dmc, dc")
        .eq("inputs", FWI_INPUTS)
        .order("date", { ascending: false })
        .range(from, to),
  )) {
    if (!stored.has(row.commune_id)) stored.set(row.commune_id, row);
  }

  const todayMs = Date.parse(`${baseDate}T00:00:00Z`);
  const daysSince = (date: string) =>
    Math.round((todayMs - Date.parse(date)) / 86400000);

  // a commune resumes from its stored codes; one that is missing or stale needs
  // the full spin-up for DC to converge
  const windowFor = (id: string) => {
    const st = stored.get(id);
    if (!st) return SPINUP_DAYS;
    const gap = daysSince(st.date);
    if (gap < 1 || gap > STALE_STATE_DAYS) return SPINUP_DAYS;
    return gap;
  };

  const groups = new Map<number, typeof communes>();
  for (const c of communes) {
    const w = windowFor(c.id);
    const bucket = groups.get(w);
    if (bucket) bucket.push(c);
    else groups.set(w, [c]);
  }

  type Row = {
    snapshot_id: string;
    commune_id: string;
    forecast_date: string;
    horizon_days: number;
    fwi: number;
    danger_level: number;
    fuel_limited: boolean;
    components: Record<string, number>;
  };

  const flush = async (
    rows: Row[],
    states: (StoredState & { commune_id: string })[],
  ) => {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabaseAdmin.rpc("stage_risk_forecast_batch", {
        _snapshot_id: snapshotId,
        _rows: rows.slice(i, i + 500),
      });
      if (error)
        throw new Error(`risk forecast staging failed: ${error.message}`);
    }
    for (let i = 0; i < states.length; i += 500) {
      const { error } = await supabaseAdmin.from("fwi_state").upsert(
        states.slice(i, i + 500).map((st) => ({ ...st, inputs: FWI_INPUTS })),
        { onConflict: "commune_id,date" },
      );
      if (error) throw new Error(`fwi_state upsert failed: ${error.message}`);
    }
  };

  let written = 0;
  let requests = 0;

  const fail = async (error: unknown): Promise<RiskRun> => {
    const message =
      typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : "refresh failed";
    const cleanupError = await discard();
    const cleanupMessage = cleanupError?.message;
    return {
      communes: communes.length,
      rows: written,
      requests,
      error: cleanupMessage
        ? `${message}; staging cleanup failed: ${cleanupMessage}`
        : message,
    };
  };

  for (const [pastDays, members] of groups) {
    for (let i = 0; i < members.length; i += BATCH) {
      if (requests > 0) await sleep(INTER_BATCH_MS);
      const batch = members.slice(i, i + BATCH);
      let dailies: (DailyBlock | null)[];
      try {
        dailies = await fetchDaily(
          batch.map((c) => c.lat),
          batch.map((c) => c.lon),
          pastDays,
        );
        requests += 1;
      } catch (e) {
        return fail(e);
      }
      const rows: Row[] = [];
      const nextState: (StoredState & { commune_id: string })[] = [];
      batch.forEach((commune, idx) => {
        const daily = dailies[idx];
        if (!daily) return;
        const prev = stored.get(commune.id);
        const resume =
          prev && windowFor(commune.id) !== SPINUP_DAYS
            ? { ffmc: prev.ffmc, dmc: prev.dmc, dc: prev.dc }
            : undefined;
        const { days, carried } = seriesFwi(
          daily,
          commune.forest_fraction ?? 0,
          resume,
        );
        const fuelLimited = isFuelLimited(commune.landcover);
        if (carried) nextState.push({ commune_id: commune.id, ...carried });
        // derived from the date, not the array index: a dropped day would otherwise
        // shift every horizon and label a forecast with the wrong day
        days.forEach((day) => {
          const horizon = Math.round(
            (Date.parse(`${day.date}T00:00:00Z`) - todayMs) / 86400000,
          );
          if (horizon < 0 || horizon >= HORIZON_DAYS) return;
          rows.push({
            snapshot_id: snapshotId,
            commune_id: commune.id,
            forecast_date: day.date,
            horizon_days: horizon,
            fwi: day.fwi,
            danger_level: day.level,
            fuel_limited: fuelLimited,
            components: day.components,
          });
        });
      });
      try {
        await flush(rows, nextState);
      } catch (error) {
        return fail(error);
      }
      written += rows.length;
    }
  }

  const promotionArgs = {
    _snapshot_id: snapshotId,
    _base_date: baseDate,
    _scheduled_for: scheduledFor,
  };
  let promotion = await supabaseAdmin.rpc(
    "publish_risk_forecast_snapshot",
    promotionArgs,
  );
  if (promotion.error)
    promotion = await supabaseAdmin.rpc(
      "publish_risk_forecast_snapshot",
      promotionArgs,
    );
  const { data: promoted, error: promotionError } = promotion;
  if (promotionError)
    return fail(`risk snapshot promotion failed: ${promotionError.message}`);
  const publication = promoted as {
    status?: string;
    rows?: number;
    published_at?: string | null;
  } | null;
  if (publication?.status === "superseded")
    return {
      communes: communes.length,
      rows: written,
      requests,
      superseded: true,
    };
  if (
    publication?.status !== "promoted" ||
    publication.rows !== written ||
    !publication.published_at
  )
    return fail(
      `risk snapshot promotion count mismatch: expected ${written}, got ${publication?.rows ?? "invalid response"}`,
    );

  return {
    communes: communes.length,
    rows: written,
    requests,
    publishedAt: publication.published_at,
  };
}

export type ClusterWeather = {
  wind_speed_kmh: number;
  wind_dir_deg: number;
  spread_bearing_deg: number;
  wind_gust_kmh: number | null;
  vpd_kpa: number | null;
  soil_moisture_m3m3: number | null;
};

const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export function clusterWeatherUpdate(current: unknown): ClusterWeather | null {
  if (typeof current !== "object" || current === null) return null;
  const c = current as Record<string, unknown>;
  const speed = num(c["wind_speed_10m"]);
  const dir = num(c["wind_direction_10m"]);
  if (speed === null || dir === null) return null;
  return {
    wind_speed_kmh: speed,
    wind_dir_deg: dir,
    spread_bearing_deg: (dir + 180) % 360,
    wind_gust_kmh: num(c["wind_gusts_10m"]),
    vpd_kpa: num(c["vapour_pressure_deficit"]),
    soil_moisture_m3m3: num(c["soil_moisture_0_to_1cm"]),
  };
}

/** Attach current wind to live clusters so the spread arrow is real. */
export async function enrichClusterWinds(): Promise<number> {
  const { data: clusters } = await supabaseAdmin
    .from("fire_clusters")
    .select("id, lat, lon")
    .in("state", ["active", "unconfirmed", "contained_guess"])
    .gte("last_detected_at", new Date(Date.now() - 24 * 3600_000).toISOString())
    .order("last_detected_at", { ascending: false })
    .limit(100);
  if (!clusters?.length) return 0;

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", clusters.map((c) => c.lat).join(","));
  url.searchParams.set("longitude", clusters.map((c) => c.lon).join(","));
  url.searchParams.set(
    "current",
    "wind_speed_10m,wind_direction_10m,wind_gusts_10m,vapour_pressure_deficit,soil_moisture_0_to_1cm",
  );
  const res = await fetch(url);
  // returning 0 here made a failed fetch indistinguishable from "no live fires"
  if (!res.ok) throw new Error(`open-meteo wind ${res.status}`);
  const json = (await res.json()) as
    { current?: unknown } | Array<{ current?: unknown }>;
  const list = Array.isArray(json) ? json : [json];

  const updates = clusters.flatMap((cluster, i) => {
    const weather = clusterWeatherUpdate(list[i]?.current);
    return weather ? [{ cluster, weather }] : [];
  });

  for (let i = 0; i < updates.length; i += 10) {
    await Promise.all(
      updates
        .slice(i, i + 10)
        .map(({ cluster, weather }) =>
          supabaseAdmin
            .from("fire_clusters")
            .update(weather)
            .eq("id", cluster.id),
        ),
    );
  }
  return updates.length;
}
