import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/private/push-test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handlePushTest } = await import("@/lib/push-test.server");
        return handlePushTest(request);
      },
      ANY: () =>
        new Response(null, { status: 405, headers: { Allow: "POST" } }),
    },
  },
});
