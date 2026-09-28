import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/private/ensemble")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const { appPreflight } = await import("@/lib/app-cors.server");
        return appPreflight(request, "GET");
      },
      ANY: () =>
        Response.json(
          { error: "Method not allowed" },
          {
            status: 405,
            headers: { Allow: "GET", "Cache-Control": "private, no-store" },
          },
        ),
      GET: async ({ request }) => {
        const { handleEnsemblePreview } = await import("@/lib/ensemble.server");
        const { withAppCors } = await import("@/lib/app-cors.server");
        return withAppCors(request, await handleEnsemblePreview(request));
      },
    },
  },
});
