import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { preflight } = await import("@/lib/public-api.server");
        return preflight();
      },
      GET: async ({ request }) => {
        const { json } = await import("@/lib/public-api.server");
        const base = new URL(request.url).origin;
        return json({
          name: "Nadhir public API",
          version: "1",
          licence: "CC-BY 4.0 — attribution required",
          notes:
            "Read-only. Responses are cached for 60 seconds. Please stay under 60 requests per minute.",
          endpoints: [
            {
              path: "/api/public/v1/fires",
              params: {
                state: "optional",
                since: "optional ISO timestamp",
                limit: "1-500",
                offset: "integer",
                format: "json (default) or geojson",
              },
              example: `${base}/api/public/v1/fires?state=active&limit=50`,
            },
            {
              path: "/api/public/v1/stats",
              params: {},
              example: `${base}/api/public/v1/stats`,
            },
            {
              path: "/api/public/v1/status",
              params: {},
              example: `${base}/api/public/v1/status`,
            },
            {
              path: "/api/public/v1/risk",
              params: {
                horizon: "0-5",
                commune: "optional commune code",
                limit: "1-1000",
                offset: "integer",
              },
              example: `${base}/api/public/v1/risk?horizon=0&limit=20`,
            },
          ],
        });
      },
    },
  },
});
