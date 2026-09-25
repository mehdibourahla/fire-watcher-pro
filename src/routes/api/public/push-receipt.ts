import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/push-receipt")({
  server: {
    handlers: {
      ANY: async () => {
        const { postOnlyMethodNotAllowed } =
          await import("@/lib/post-only.server");
        return postOnlyMethodNotAllowed();
      },
      POST: async ({ request }) => {
        const { recordPushReceipt } = await import("@/lib/push-receipt.server");
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(null, { status: 400 });
        }
        const outcome = await recordPushReceipt(body);
        return new Response(null, {
          status:
            outcome === "recorded" ? 204 : outcome === "forged" ? 403 : 400,
        });
      },
    },
  },
});
