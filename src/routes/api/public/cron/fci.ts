import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authenticateSchedulerRequest } from "@/lib/cron-auth.server";
import { screenPersistentSources } from "@/lib/ingest/persistent.server";
import { fuseDetections } from "@/lib/ingest/fusion.server";

type FciDetectionPayload = {
  detected_at: string;
  lat: number;
  lon: number;
  confidence_raw: number;
  frp_mw?: number | null;
};

export const Route = createFileRoute("/api/public/cron/fci")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticateSchedulerRequest(request);
        if (unauthorized) return unauthorized;

        try {
          const body = (await request.json()) as {
            detections?: FciDetectionPayload[];
            sensor?: string;
          };
          const list = body.detections ?? [];

          if (!list.length) {
            return Response.json({
              ok: true,
              inserted: 0,
              message: "no detections",
            });
          }

          const rows = list.map((d) => ({
            source: "eumetsat_fci",
            sensor: body.sensor ?? "FCI",
            detected_at: d.detected_at,
            lat: d.lat,
            lon: d.lon,
            confidence_raw: Math.max(0, Math.min(1, d.confidence_raw)),
            frp_mw: d.frp_mw ?? null,
            natural_key: `eumetsat:${body.sensor ?? "FCI"}:${d.lat.toFixed(5)}:${d.lon.toFixed(5)}:${d.detected_at}`,
          }));

          const { error: insertError } = await supabaseAdmin
            .from("detections")
            .upsert(rows, {
              onConflict: "natural_key",
              ignoreDuplicates: true,
            });

          if (insertError) {
            throw new Error(`detections insert failed: ${insertError.message}`);
          }

          // Screen persistent industrial sources and run clustering fusion
          const screen = await screenPersistentSources();
          const fusion = await fuseDetections();

          return Response.json({
            ok: true,
            inserted: rows.length,
            screened: screen.screened,
            fusion: {
              clustersTouched: fusion.clustersTouched,
              created: fusion.created,
            },
          });
        } catch (error) {
          return Response.json(
            {
              ok: false,
              error: error instanceof Error ? error.message : "unknown error",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
