import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/contribute/vote")({
  server: {
    handlers: {
      ANY: async () => {
        const { postOnlyMethodNotAllowed } =
          await import("@/lib/post-only.server");
        return postOnlyMethodNotAllowed();
      },
      POST: async ({ request }) => {
        const { castVote, clientIp } = await import("@/lib/contribute.server");
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
        const outcome = await castVote(
          String(input["ideaId"] ?? ""),
          String(input["voterKey"] ?? ""),
          Number(input["value"] ?? 0),
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
