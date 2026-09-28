import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/private/account")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const { appPreflight } = await import("@/lib/app-cors.server");
        return appPreflight(request, "DELETE");
      },
      ANY: () =>
        Response.json(
          { error: "Method not allowed" },
          {
            status: 405,
            headers: { Allow: "DELETE", "Cache-Control": "private, no-store" },
          },
        ),
      DELETE: async ({ request }) => {
        const { handleDeleteAccount } =
          await import("@/lib/delete-account.server");
        const { withAppCors } = await import("@/lib/app-cors.server");
        return withAppCors(request, await handleDeleteAccount(request));
      },
    },
  },
});
