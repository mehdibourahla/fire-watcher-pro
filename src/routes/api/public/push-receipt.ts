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
        const { readJsonBody } = await import("@/lib/request-body.server");
        const read = await readJsonBody(request, 1024);
        if ("error" in read) return new Response(null, { status: read.status });
        const outcome = await recordPushReceipt(read.body);
        return new Response(null, {
          status:
            outcome === "recorded" ? 204 : outcome === "forged" ? 403 : 400,
        });
      },
    },
  },
});
