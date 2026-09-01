import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/contribute/translation")({
  server: {
    handlers: {
      ANY: async () => {
        const { postOnlyMethodNotAllowed } =
          await import("@/lib/post-only.server");
        return postOnlyMethodNotAllowed();
      },
      POST: async ({ request }) => {
        const { submitSuggestions } = await import("@/lib/translate.server");
        const { clientIp } = await import("@/lib/contribute.server");
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
        const rows = Array.isArray(input["rows"])
          ? (input["rows"] as Record<string, unknown>[]).map((r) => ({
              keyPath: String(r["keyPath"] ?? ""),
              sourceText: String(r["sourceText"] ?? ""),
              currentText: String(r["currentText"] ?? ""),
              suggestion: r["suggestion"] ? String(r["suggestion"]) : null,
              verdict: String(r["verdict"] ?? ""),
              note: r["note"] ? String(r["note"]) : null,
            }))
          : [];

        const outcome = await submitSuggestions(
          String(input["locale"] ?? ""),
          String(input["reviewerKey"] ?? ""),
          input["reviewerName"] ? String(input["reviewerName"]) : null,
          rows,
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
