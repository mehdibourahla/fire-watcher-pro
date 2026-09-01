import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/contribute/idea")({
  server: {
    handlers: {
      ANY: async () => {
        const { postOnlyMethodNotAllowed } =
          await import("@/lib/post-only.server");
        return postOnlyMethodNotAllowed();
      },
      POST: async ({ request }) => {
        const { submitIdea, clientIp } =
          await import("@/lib/contribute.server");
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json(
            { ok: false, reason: "failed" },
            { status: 400 },
          );
        }
        const input = body as Record<string, unknown>;
        const outcome = await submitIdea(
          {
            lane: String(input["lane"] ?? "other"),
            message: String(input["message"] ?? ""),
            contact: input["contact"] ? String(input["contact"]) : null,
            locale: String(input["locale"] ?? "en"),
            website: input["website"] ? String(input["website"]) : undefined,
          },
          clientIp(request),
        );
        if (outcome.ok) return Response.json(outcome);
        return Response.json(outcome, {
          status: outcome.reason === "rateLimited" ? 429 : 400,
        });
      },
    },
  },
});
