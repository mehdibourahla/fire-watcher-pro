import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/private/alert-check")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const { appPreflight } = await import("@/lib/app-cors.server");
        return appPreflight(request, "POST");
      },
      POST: async ({ request }) => {
        const [{ handleAlertCheck }, { withAppCors }] = await Promise.all([
          import("@/lib/alert-check.server"),
          import("@/lib/app-cors.server"),
        ]);
        return withAppCors(request, await handleAlertCheck(request));
      },
      ANY: () =>
        new Response(null, { status: 405, headers: { Allow: "POST" } }),
    },
  },
});
