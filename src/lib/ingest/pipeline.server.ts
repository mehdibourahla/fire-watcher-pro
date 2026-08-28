import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { ingestEumetsat } from "./eumetsat.server";
import { ingestFirms } from "./firms.server";
import { fuseDetections } from "./fusion.server";
import { enrichClusterWinds, refreshRiskForecasts } from "./weather.server";

type RunOutcome = {
  status: "ok" | "failed";
  recordsIn?: number;
  recordsNew?: number;
  error?: string;
};

/**
 * Journalling a run is observability, not the job itself — a failure here must
 * not discard detections that were already ingested successfully.
 */
async function recordRun(
  source: string,
  startedAt: string,
  outcome: RunOutcome,
) {
  // cast until generated types pick up ingest_runs from its migration
  const { error } = await (
    supabaseAdmin.from as unknown as (t: string) => {
      insert: (
        row: Record<string, unknown>,
      ) => Promise<{ error: { message: string } | null }>;
    }
  )("ingest_runs").insert({
    source,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status: outcome.status,
    records_in: outcome.recordsIn ?? 0,
    records_new: outcome.recordsNew ?? 0,
    error: outcome.error ?? null,
  });
  if (error)
    console.warn(`[ingest_runs] could not record ${source}:`, error.message);
}

async function markSource(name: string, ok: boolean, note: string) {
  await supabaseAdmin
    .from("data_sources")
    .update({
      status: ok ? "ok" : "degraded",
      note,
      updated_at: new Date().toISOString(),
      ...(ok ? { last_ok_at: new Date().toISOString() } : {}),
    })
    .eq("name", name);
}

export type PipelineResult = {
  firms: Awaited<ReturnType<typeof ingestFirms>>;
  eumetsat: Awaited<ReturnType<typeof ingestEumetsat>>;
  fusion: Awaited<ReturnType<typeof fuseDetections>> | null;
  winds: number;
};

/** Satellite ingest → fusion → wind enrichment. Runs every ~15 minutes. */
export async function runDetectionPipeline(): Promise<PipelineResult> {
  const startedAt = new Date().toISOString();

  const firms = await ingestFirms();
  await recordRun("firms", startedAt, {
    status: firms.error ? "failed" : "ok",
    recordsIn: firms.fetched,
    recordsNew: firms.inserted,
    ...(firms.error ? { error: firms.error } : {}),
  });
  await markSource(
    "firms",
    !firms.error,
    firms.error ??
      `${firms.inserted} new detections (${firms.feeds.join(", ") || "no rows"})`,
  );

  const fciStartedAt = new Date().toISOString();
  const eumetsat = await ingestEumetsat();
  await recordRun("fci", fciStartedAt, {
    status: eumetsat.error ? "failed" : "ok",
    recordsIn: eumetsat.granules,
    recordsNew: eumetsat.inserted,
    ...(eumetsat.error ? { error: eumetsat.error } : {}),
  });
  await markSource(
    "fci",
    !eumetsat.error && (eumetsat.ageMinutes ?? 999) < 180,
    eumetsat.error ??
      `${eumetsat.sensor} granule ${eumetsat.ageMinutes} min old (${eumetsat.granules} in window)`,
  );

  const fusionStartedAt = new Date().toISOString();
  let fusion: PipelineResult["fusion"] = null;
  try {
    fusion = await fuseDetections();
    await recordRun("fusion", fusionStartedAt, {
      status: "ok",
      recordsIn: fusion.processed,
      recordsNew: fusion.created,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "fusion failed";
    await recordRun("fusion", fusionStartedAt, {
      status: "failed",
      error: message,
    });
    await markSource("geo", false, message);
  }

  let winds = 0;
  try {
    winds = await enrichClusterWinds();
    await markSource("openmeteo", true, `Wind attached to ${winds} live fires`);
  } catch (error) {
    await markSource(
      "openmeteo",
      false,
      error instanceof Error ? error.message : "weather failed",
    );
  }

  return { firms, eumetsat, fusion, winds };
}

/** Daily FWI outlook refresh. */
export async function runRiskPipeline() {
  const risk = await refreshRiskForecasts();
  await markSource(
    "local_fwi",
    !risk.error,
    risk.error ??
      `FWI computed locally for ${risk.communes} communes (${risk.rows} rows)`,
  );
  return risk;
}
