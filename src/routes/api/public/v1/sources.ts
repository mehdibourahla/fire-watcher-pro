import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/sources")({
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
        const limit = clampInt(url.searchParams.get("limit"), 500, 1, 2000);
        const offset = clampInt(url.searchParams.get("offset"), 0, 0, 100000);

        const { data, error } = await publicSupabase()
          .from("persistent_sources")
          .select(
            "lat, lon, site_id, site_name, active_days, observation_days, static_share, frp_p50",
          )
          .order("detection_count", { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) return json({ error: error.message }, 502);

        return json({
          licence: "CC-BY 4.0 — Nadhir, derived from NASA FIRMS",
          generated_at: new Date().toISOString(),
          note: "Persistent industrial heat sources. These are not wildfires; detections here are excluded from fire clustering.",
          limit,
          offset,
          count: data?.length ?? 0,
          sources: data ?? [],
        });
      },
    },
  },
});
