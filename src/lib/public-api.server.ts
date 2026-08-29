import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Cache-Control": "public, max-age=60",
};

export function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
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
