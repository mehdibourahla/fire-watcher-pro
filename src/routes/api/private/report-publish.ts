import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/private/report-publish")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const { appPreflight } = await import("@/lib/app-cors.server");
        return appPreflight(request, "POST");
      },
      POST: async ({ request }) => {
        const { handleReportPublish } =
          await import("@/lib/report-publish.server");
        const { withAppCors } = await import("@/lib/app-cors.server");
        return withAppCors(request, await handleReportPublish(request));
      },
      ANY: () =>
        new Response(null, { status: 405, headers: { Allow: "POST" } }),
    },
  },
});
