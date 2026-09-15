import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/weather")({
  server: {
    handlers: {
      ANY: async () =>
        (await import("@/lib/public-api.server")).methodNotAllowed(),
      OPTIONS: async () =>
        (await import("@/lib/public-api.server")).preflight(),
      GET: async ({ request }) => {
        const { publicSupabase, json, enforceRateLimit } =
          await import("@/lib/public-api.server");
        const limited = await enforceRateLimit(request);
        if (limited) return limited;
        const code = new URL(request.url).searchParams.get("commune");
        if (!code || !/^[A-Za-z0-9_-]{1,24}$/.test(code))
          return json({ error: "invalid commune code" }, 400);
        const db = publicSupabase();
        const { data: commune, error: communeError } = await db
          .from("admin_units")
          .select("id")
          .eq("code", code)
          .eq("level", "commune")
          .maybeSingle();
        if (communeError) return json({ error: "weather unavailable" }, 503);
        if (!commune) return json({ error: "commune not found" }, 404);
        const { data, error } = await db.rpc("current_weather_snapshot", {
          _commune_id: commune.id,
        });
        if (error) return json({ error: "weather unavailable" }, 503);
        const { weatherIsStale } = await import("@/lib/weather-evidence");
        const snapshot = data as unknown as
          import("@/lib/weather-evidence").WeatherEvidence | null;
        return json({
          snapshot,
          stale: snapshot ? weatherIsStale(snapshot) : true,
        });
      },
    },
  },
});
