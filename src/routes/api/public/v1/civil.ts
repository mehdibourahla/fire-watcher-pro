import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/civil")({
  server: {
    handlers: {
      ANY: async () =>
        (await import("@/lib/public-api.server")).methodNotAllowed(),
      OPTIONS: async () =>
        (await import("@/lib/public-api.server")).preflight(),
      GET: async ({ request }) => {
        const {
          publicSupabase,
          json,
          clampInt,
          enforceRateLimit,
          CORS_HEADERS,
        } = await import("@/lib/public-api.server");
        const { buildCivilPublicationCap, capToXml } =
          await import("@/lib/cap");
        const { civilPublicationLifecycle } =
          await import("@/lib/civil-publication");
        const limited = await enforceRateLimit(request);
        if (limited) return limited;
        const params = new URL(request.url).searchParams;
        const id = params.get("id");
        const format = params.get("format") ?? "json";
        if (!["json", "cap"].includes(format) || (format === "cap" && !id))
          return json(
            { error: "Use format=json, or format=cap with a publication id." },
            400,
          );
        if (
          id &&
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            id,
          )
        )
          return json({ error: "Invalid publication id." }, 400);
        const limit = clampInt(params.get("limit"), 100, 1, 500);
        const offset = clampInt(params.get("offset"), 0, 0, 100000);
        let query = publicSupabase()
          .from("civil_publications")
          .select(
            "id,hazard,summary,area_id,source_name,source_url,source_published_at,expires_at,state,revision,cap_references,published_at,updated_at,area:admin_units(id,code,level,name_fr,name_ar,name_en,name_kab)",
          )
          .order("updated_at", { ascending: false })
          .order("id", { ascending: false });
        if (id) query = query.eq("id", id);
        else {
          if (params.get("history") !== "true")
            query = query
              .eq("state", "published")
              .gt("expires_at", new Date().toISOString());
          query = query.range(offset, offset + limit - 1);
        }
        const { data, error } = await query;
        if (error) return json({ error: "Publication data unavailable." }, 502);
        if (id && !data?.length)
          return json({ error: "Publication not found." }, 404);
        const publications = (data ?? []).map((row) => ({
          ...row,
          lifecycle: civilPublicationLifecycle(
            row as { state: "published" | "withdrawn"; expires_at: string },
          ),
          authority: false,
          geometry_precision: "administrative_area",
        }));
        if (format === "cap") {
          const row = publications[0]!;
          const cap = buildCivilPublicationCap(
            {
              ...row,
              hazard: row.hazard as
                "fire" | "weather" | "flood" | "road" | "other",
              state: row.state as "published" | "withdrawn",
              cap_references: row.cap_references as {
                revision: number;
                sent: string;
              }[],
            },
            row.area?.name_fr ?? row.area_id,
          );
          return new Response(capToXml(cap), {
            headers: {
              ...CORS_HEADERS,
              "Content-Type": "application/cap+xml; charset=utf-8",
            },
          });
        }
        return json({
          generated_at: new Date().toISOString(),
          attribution:
            "Info Trafic Algérie; reviewed by Nadhir. Source content retains its original rights.",
          notes:
            "Media information, not official instructions. Expired and withdrawn publications do not imply an all-clear.",
          limit,
          offset,
          count: publications.length,
          publications,
        });
      },
    },
  },
});
