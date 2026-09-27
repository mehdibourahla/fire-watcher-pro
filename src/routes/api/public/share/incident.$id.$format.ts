import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/share/incident/$id/$format")({
  server: {
    handlers: {
      ANY: async () => {
        const { methodNotAllowed } = await import("@/lib/public-api.server");
        return methodNotAllowed();
      },
      OPTIONS: async () => {
        const { preflight } = await import("@/lib/public-api.server");
        return preflight();
      },
      GET: async ({ request, params }) => {
        const [
          { handleShareImage, browserScreenshotter },
          { publicSupabase, enforceRateLimit },
          { fetchOfficialIncident },
        ] = await Promise.all([
          import("@/lib/share-render.server"),
          import("@/lib/public-api.server"),
          import("@/lib/nadhir"),
        ]);
        const url = new URL(request.url);
        const response = await handleShareImage(
          {
            id: params.id,
            format: params.format,
            lang: url.searchParams.get("lang"),
            v: url.searchParams.get("v"),
            origin: url.origin,
          },
          {
            load: (id) => fetchOfficialIncident(publicSupabase(), id),
            screenshot: await browserScreenshotter(),
            cache:
              typeof caches === "undefined"
                ? null
                : (caches as unknown as { default: Cache }).default,
            limit: () => enforceRateLimit(request),
          },
        );
        response.headers.set("Access-Control-Allow-Origin", "*");
        return response;
      },
    },
  },
});
