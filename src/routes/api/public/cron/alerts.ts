import { createFileRoute } from "@tanstack/react-router";

import { authenticateSchedulerRequest } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/cron/alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateSchedulerRequest(request);
        if (unauthorized) return unauthorized;
        const { evaluateAlerts } = await import("@/lib/alerts-engine.server");
        try {
          const result = await evaluateAlerts();
          return Response.json({ ok: true, ...result });
        } catch (error) {
          return Response.json(
            { ok: false, error: error instanceof Error ? error.message : "unknown" },
            { status: 500 },
          );
        }
      },
    },
  },
});
