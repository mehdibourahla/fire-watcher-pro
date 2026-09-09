import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/private/account")({
  server: {
    handlers: {
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
        return handleDeleteAccount(request);
      },
    },
  },
});
