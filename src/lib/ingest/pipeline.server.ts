import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { ingestEffis, type EffisRun } from "./effis.server";
import { ingestFci } from "./fci.server";
import { ingestFirms } from "./firms.server";
import { fuseDetections } from "./fusion.server";
import {
  flagPersistentCandidates,
  screenPersistentSources,
} from "./persistent.server";
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
  fci: Awaited<ReturnType<typeof ingestFci>>;
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
  const fci = await ingestFci();
  await recordRun("fci", fciStartedAt, {
    status: fci.error ? "failed" : "ok",
    recordsIn: fci.fetched,
    recordsNew: fci.inserted,
    ...(fci.error ? { error: fci.error } : {}),
  });
  await markSource(
    "fci",
    !fci.error,
    fci.error ??
      (fci.latestSlot
        ? `MTG FCI: ${fci.inserted} new detections, latest slot ${fci.ageMinutes} min old`
        : "MTG FCI: no detections in the current window"),
  );

  // must precede fusion: fusion only clusters detections whose fp_reason is null
  const screenStartedAt = new Date().toISOString();
  try {
    const screen = await screenPersistentSources();
    await recordRun("screen", screenStartedAt, {
      status: "ok",
      recordsIn: screen.screened,
      recordsNew: screen.screened,
    });
    await markSource(
      "screen",
      screen.registry > 0,
      screen.registry === 0
        ? "Registry empty — no detections are being screened."
        : `${screen.registry} known sources, ${screen.screened} detections screened this run`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "screen failed";
    await recordRun("screen", screenStartedAt, {
      status: "failed",
      error: message,
    });
    await markSource("screen", false, message);
    throw error;
  }

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
  await flagPersistentCandidates();

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

  return { firms, fci, fusion, winds };
}

/** Daily FWI outlook refresh, plus the EFFIS external cross-check. */
export async function runRiskPipeline() {
  const risk = await refreshRiskForecasts();
  await markSource(
    "local_fwi",
    !risk.error,
    risk.error ??
      `FWI computed locally for ${risk.communes} communes (${risk.rows} rows)`,
  );

  const effisStartedAt = new Date().toISOString();
  const effis = await ingestEffis().catch((e): EffisRun => ({
    communes: 0,
    classified: 0,
    error: e instanceof Error ? e.message : String(e),
  }));
  await recordRun("effis", effisStartedAt, {
    status: effis.error ? "failed" : "ok",
    recordsIn: effis.communes,
    recordsNew: effis.classified,
    ...(effis.error ? { error: effis.error } : {}),
  });
  await markSource(
    "effis",
    !effis.error,
    effis.error ??
      `EFFIS danger classes stored for ${effis.classified} of ${effis.communes} communes`,
  );

  // The workflow greps this JSON for "error": EFFIS failure must only degrade
  // its own health row, never fail the FWI refresh — so no error string here.
  return { ...risk, effisClassified: effis.classified };
}
