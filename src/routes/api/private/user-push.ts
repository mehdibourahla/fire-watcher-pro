import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/private/user-push")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const { appPreflight } = await import("@/lib/app-cors.server");
        return appPreflight(request, "POST");
      },
      POST: async ({ request }) => {
        const { handleUserPush } = await import("@/lib/user-push.server");
        const { withAppCors } = await import("@/lib/app-cors.server");
        return withAppCors(request, await handleUserPush(request));
      },
      ANY: () =>
        new Response(null, { status: 405, headers: { Allow: "POST" } }),
    },
  },
});
