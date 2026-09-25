import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/private/report-publish")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleReportPublish } =
          await import("@/lib/report-publish.server");
        return handleReportPublish(request);
      },
      ANY: () =>
        new Response(null, { status: 405, headers: { Allow: "POST" } }),
    },
  },
});
