import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/fires")({
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
        const {
          publicSupabase,
          json,
          clampInt,
          enforceRateLimit,
          fireFeatureCollection,
        } = await import("@/lib/public-api.server");
        const limited = await enforceRateLimit(request);
        if (limited) return limited;

        const url = new URL(request.url);
        const format = url.searchParams.get("format");
        if (format && format !== "geojson" && format !== "json") {
          return json(
            { error: "invalid format", allowed: ["json", "geojson"] },
            400,
          );
        }
        const limit = clampInt(url.searchParams.get("limit"), 100, 1, 500);
        const offset = clampInt(url.searchParams.get("offset"), 0, 0, 100000);
        const state = url.searchParams.get("state");
        const since = url.searchParams.get("since");

        const allowedStates = [
          "unconfirmed",
          "active",
          "contained_guess",
          "extinguished",
          "false_positive",
        ];
        if (state && !allowedStates.includes(state)) {
          return json({ error: "invalid state", allowed: allowedStates }, 400);
        }
        if (since && Number.isNaN(Date.parse(since))) {
          return json(
            { error: "invalid since — expected an ISO 8601 timestamp" },
            400,
          );
        }

        let query = publicSupabase()
          .from("fire_clusters")
          .select(
            "short_id, state, first_detected_at, last_detected_at, lat, lon, detection_count, sources, max_frp_mw, confidence, est_area_ha, wind_speed_kmh, wind_dir_deg, spread_bearing_deg, nearest_settlement_km",
          )
          .order("last_detected_at", { ascending: false })
          .range(offset, offset + limit - 1);
        // false_positive means "this was not a fire"; it is served only on request
        if (state) query = query.eq("state", state);
        else query = query.neq("state", "false_positive");
        if (since)
          query = query.gte("last_detected_at", new Date(since).toISOString());

        const { data, error } = await query;
        if (error) return json({ error: error.message }, 502);

        const licence = "CC-BY 4.0 — Nadhir, derived from NASA FIRMS";
        const generated_at = new Date().toISOString();

        if (format === "geojson") {
          return json(
            {
              ...fireFeatureCollection(data ?? []),
              licence,
              generated_at,
            },
            200,
            "application/geo+json",
          );
        }

        return json({
          licence,
          generated_at,
          limit,
          offset,
          count: data?.length ?? 0,
          fires: data ?? [],
        });
      },
    },
  },
});
