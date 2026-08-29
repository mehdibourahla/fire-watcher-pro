import { createFileRoute } from "@tanstack/react-router";

const WINDOW_DAYS = 7;

export const Route = createFileRoute("/api/public/v1/stats")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { preflight } = await import("@/lib/public-api.server");
        return preflight();
      },
      GET: async ({ request }) => {
        const { publicSupabase, json, enforceRateLimit, summariseFires } =
          await import("@/lib/public-api.server");
        const { fetchAllPages } = await import("@/lib/paginate");
        const limited = await enforceRateLimit(request);
        if (limited) return limited;

        const since = new Date(
          Date.now() - WINDOW_DAYS * 24 * 3600_000,
        ).toISOString();

        let rows;
        try {
          rows = await fetchAllPages<{
            state: string;
            wilaya_id: string | null;
            last_detected_at: string;
          }>((from, to) =>
            publicSupabase()
              .from("fire_clusters")
              .select("state, wilaya_id, last_detected_at")
              .neq("state", "false_positive")
              .gte("last_detected_at", since)
              .order("last_detected_at", { ascending: false })
              .range(from, to),
          );
        } catch (e) {
          return json({ error: (e as Error).message }, 502);
        }

        return json({
          licence: "CC-BY 4.0 — Nadhir, derived from NASA FIRMS",
          generated_at: new Date().toISOString(),
          window_days: WINDOW_DAYS,
          total: rows.length,
          ...summariseFires(rows, Date.now()),
        });
      },
    },
  },
});
