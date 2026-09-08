import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/private/ensemble")({
  server: {
    handlers: {
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
        return handleEnsemblePreview(request);
      },
    },
  },
});
