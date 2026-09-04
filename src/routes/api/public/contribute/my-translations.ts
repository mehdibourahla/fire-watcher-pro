import { createFileRoute } from "@tanstack/react-router";

// POST rather than GET so the reviewer key stays out of URLs and access logs.
export const Route = createFileRoute("/api/public/contribute/my-translations")({
  server: {
    handlers: {
      ANY: async () => {
        const { postOnlyMethodNotAllowed } =
          await import("@/lib/post-only.server");
        return postOnlyMethodNotAllowed();
      },
      POST: async ({ request }) => {
        const { readMySuggestions } = await import("@/lib/translate.server");
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ rows: [] }, { status: 400 });
        }
        const input = body as Record<string, unknown>;
        const rows = await readMySuggestions(
          String(input["locale"] ?? ""),
          String(input["reviewerKey"] ?? ""),
        );
        return Response.json(
          { rows },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
