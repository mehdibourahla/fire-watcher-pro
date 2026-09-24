import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/private/user-push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleUserPush } = await import("@/lib/user-push.server");
        return handleUserPush(request);
      },
      ANY: () =>
        new Response(null, { status: 405, headers: { Allow: "POST" } }),
    },
  },
});
