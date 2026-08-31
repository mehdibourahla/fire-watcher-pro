import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { summariseSourceHealth, type SourceHealth } from "@/lib/source-health";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Cache-Control": "public, max-age=60",
};

export function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function json(
  body: unknown,
  status = 200,
  contentType = "application/json",
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": contentType },
  });
}

/** Publishable-key client: reads only what the anon SELECT policies allow. */
export function publicSupabase() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
          h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const RATE_LIMIT_PER_MINUTE = 60;

/** Spec 11: 60 rpm per IP. Returns a 429 Response when the caller is over. */
export async function enforceRateLimit(
  request: Request,
): Promise<Response | null> {
  // cf-connecting-ip is set by the edge; x-forwarded-for is caller-supplied, so
  // trusting it first let anyone reset their own bucket on every request
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip =
    request.headers.get("cf-connecting-ip") ||
    forwarded.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const { data, error } = await publicSupabase().rpc("consume_rate_limit", {
    _bucket: `public-api:${ip}`,
    _limit: RATE_LIMIT_PER_MINUTE,
    _window_seconds: 60,
  });

  // an unreachable limiter must not take the whole API down with it
  if (error) return null;
  if (data === false) {
    return new Response(
      JSON.stringify({
        error: "rate limit exceeded",
        limit: RATE_LIMIT_PER_MINUTE,
        window_seconds: 60,
      }),
      {
        status: 429,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      },
    );
  }
  return null;
}

export function clampInt(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
) {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

type FireFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, unknown>;
};

export function fireFeatureCollection(
  fires: ({ lat: number; lon: number } & Record<string, unknown>)[],
): { type: "FeatureCollection"; features: FireFeature[] } {
  return {
    type: "FeatureCollection",
    features: fires.map(({ lat, lon, ...properties }) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties,
    })),
  };
}

const LIVE_STATES = ["active", "unconfirmed", "contained_guess"];

export function summariseFires(
  rows: {
    state: string;
    wilaya_id: string | null;
    last_detected_at: string;
  }[],
  now: number,
) {
  const by_state: Record<string, number> = {};
  const wilayas = new Set<string>();
  let detected_last_24h = 0;

  for (const row of rows) {
    by_state[row.state] = (by_state[row.state] ?? 0) + 1;
    if (now - Date.parse(row.last_detected_at) <= 24 * 3600_000)
      detected_last_24h += 1;
    if (LIVE_STATES.includes(row.state) && row.wilaya_id)
      wilayas.add(row.wilaya_id);
  }

  return {
    by_state,
    detected_last_24h,
    wilayas_with_live_fires: wilayas.size,
  };
}

export function serializePublicSourceStatus(
  rows: SourceHealth[],
  generatedAt = new Date().toISOString(),
) {
  const summary = summariseSourceHealth(rows);

  return {
    generated_at: generatedAt,
    overall: summary.allHealthy ? ("healthy" as const) : ("affected" as const),
    affected: summary.affected,
    critical_affected: summary.criticalAffected,
    sources: rows.map((source) => ({
      key: source.key,
      family: source.family,
      state: source.state,
      valid_at: source.valid_at,
      published_at: source.published_at,
      age_minutes: source.age_minutes,
      coverage: {
        status: source.coverage_status,
        accepted: source.records_accepted,
        expected: source.records_expected,
      },
      fallback: source.fallback_contract_key,
      reason: source.public_reason_code,
    })),
  };
}
