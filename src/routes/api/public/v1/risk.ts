import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/risk")({
  server: {
    handlers: {
      ANY: async () => {
        const { methodNotAllowed } = await import("@/lib/public-api.server");
        return methodNotAllowed();
      },
      OPTIONS: async () => {
        const { preflight } = await import("@/lib/public-api.server");
        return preflight();
      },
      GET: async ({ request }) => {
        const { publicSupabase, json, clampInt, enforceRateLimit } =
          await import("@/lib/public-api.server");
        const limited = await enforceRateLimit(request);
        if (limited) return limited;

        const url = new URL(request.url);
        const limit = clampInt(url.searchParams.get("limit"), 200, 1, 1000);
        const offset = clampInt(url.searchParams.get("offset"), 0, 0, 100000);
        const horizon = clampInt(url.searchParams.get("horizon"), 0, 0, 5);
        const communeCode = url.searchParams.get("commune");

        const supabase = publicSupabase();

        let communeId: string | null = null;
        if (communeCode) {
          if (!/^[A-Za-z0-9_-]{1,24}$/.test(communeCode)) {
            return json({ error: "invalid commune code" }, 400);
          }
          const { data: unit } = await supabase
            .from("admin_units")
            .select("id")
            .eq("code", communeCode)
            .maybeSingle();
          if (!unit) return json({ error: "commune not found" }, 404);
          communeId = unit.id;
        }

        // horizon-0 rows accumulate one per run, so the query must pin the
        // current run's date or it ranks yesterday's forecasts beside today's
        const { data: latest } = await supabase
          .from("risk_forecasts")
          .select("forecast_date")
          .eq("horizon_days", 0)
          .order("forecast_date", { ascending: false })
          .limit(1);
        const base = latest?.[0]?.forecast_date;
        if (!base) return json({ error: "no forecast available" }, 503);
        const date = new Date(
          Date.parse(`${base}T00:00:00Z`) + horizon * 86_400_000,
        )
          .toISOString()
          .slice(0, 10);

        let query = supabase
          .from("risk_forecasts")
          .select(
            "forecast_date, horizon_days, fwi, danger_level, fuel_limited, source, admin_units!inner(code, name_en, name_ar, name_fr, level)",
          )
          .eq("horizon_days", horizon)
          .eq("forecast_date", date)
          .order("fuel_limited", { ascending: true })
          .order("danger_level", { ascending: false })
          .range(offset, offset + limit - 1);
        if (communeId) query = query.eq("commune_id", communeId);

        const { data, error } = await query;
        if (error) return json({ error: error.message }, 502);

        return json({
          licence: "CC-BY 4.0 — Nadhir, FWI computed from Open-Meteo forecasts",
          generated_at: new Date().toISOString(),
          horizon_days: horizon,
          limit,
          offset,
          count: data?.length ?? 0,
          forecasts: data ?? [],
        });
      },
    },
  },
});
