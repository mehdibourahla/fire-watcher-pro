import { createFileRoute } from "@tanstack/react-router";

import { authenticateSchedulerRequest } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/cron/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateSchedulerRequest(request);
        if (unauthorized) return unauthorized;
        const { runDetectionPipeline } = await import("@/lib/ingest/pipeline.server");
        try {
          const result = await runDetectionPipeline();
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
