import {
  deliveryRunOutcome,
  publicReasonForError,
  sourceRunOutcome,
} from "@/lib/source-runs";
import { recordSourceRun } from "@/lib/source-runs.server";

import { algiersToday } from "./algiers-date";
import { ingestEffis, type EffisRun } from "./effis.server";
import { ingestFci } from "./fci.server";
import { ingestFirms } from "./firms.server";
import { ingestOnm } from "./onm.server";
import { fuseDetections } from "./fusion.server";
import {
  flagPersistentCandidates,
  screenPersistentSources,
} from "./persistent.server";
import { publishBroadcasts } from "./broadcast.server";
import { deliverBroadcasts } from "./delivery.server";
import { enrichClusterWinds, refreshRiskForecasts } from "./weather.server";

export type PipelineResult = {
  firms: Awaited<ReturnType<typeof ingestFirms>>;
  fci: Awaited<ReturnType<typeof ingestFci>>;
  fusion: Awaited<ReturnType<typeof fuseDetections>> | null;
  winds: number;
  broadcast: Awaited<ReturnType<typeof publishBroadcasts>> | null;
  delivery: Awaited<ReturnType<typeof deliverBroadcasts>> | null;
};

/** Satellite ingest → fusion → wind enrichment. Runs every ~15 minutes. */
export async function runDetectionPipeline(): Promise<PipelineResult> {
  const scheduledFor = new Date().toISOString();

  const firmsStartedAt = new Date().toISOString();
  const firms = await ingestFirms();
  const firmsHealth = sourceRunOutcome({
    accepted: firms.fetched,
    error: firms.error,
  });
  await recordSourceRun({
    contractKey: "firms",
    trigger: "scheduled",
    scheduledFor,
    startedAt: firmsStartedAt,
    ...firmsHealth,
    recordsSeen: firms.fetched,
    recordsInserted: firms.inserted,
    qualityChecks: { feeds_answered: firms.feeds.length },
    publicReasonCode: firms.error ? publicReasonForError(firms.error) : null,
    privateDiagnostic: firms.error ?? null,
  });

  const fciStartedAt = new Date().toISOString();
  const fci = await ingestFci();
  const fciAccepted = Math.max(fci.fetched - fci.outside, 0);
  const fciHealth = sourceRunOutcome({
    accepted: fciAccepted,
    error: fci.error,
  });
  await recordSourceRun({
    contractKey: "fci",
    trigger: "scheduled",
    scheduledFor,
    startedAt: fciStartedAt,
    ...fciHealth,
    upstreamPublishedAt: fci.latestSlot,
    dataThrough: fci.latestSlot,
    recordsSeen: fci.fetched,
    recordsInserted: fci.inserted,
    recordsRejected: fci.outside,
    qualityChecks: {
      inside_watch_box: fci.outside === 0,
      latest_slot_age_minutes: fci.ageMinutes,
    },
    publicReasonCode: fci.error ? publicReasonForError(fci.error) : null,
    privateDiagnostic: fci.error ?? null,
  });

  const onmStartedAt = new Date().toISOString();
  const onm = await ingestOnm();
  const onmAccepted = Math.max(onm.fetched - onm.unmatched, 0);
  const onmHealth = sourceRunOutcome({
    accepted: onmAccepted,
    expected: onm.fetched || null,
    error: onm.error,
  });
  await recordSourceRun({
    contractKey: "onm",
    trigger: "scheduled",
    scheduledFor,
    startedAt: onmStartedAt,
    ...onmHealth,
    recordsSeen: onm.fetched,
    recordsInserted: onm.stored,
    recordsRejected: onm.unmatched,
    recordsExpected: onm.fetched || null,
    qualityChecks: { unmatched_wilayas: onm.unmatched },
    publicReasonCode: onm.error
      ? publicReasonForError(onm.error)
      : onmHealth.outcome === "partial"
        ? "coverage_partial"
        : null,
    privateDiagnostic: onm.error ?? null,
  });

  // must precede fusion: fusion only clusters detections whose fp_reason is null
  const screenStartedAt = new Date().toISOString();
  try {
    const screen = await screenPersistentSources();
    const screenComplete = screen.registry > 0;
    await recordSourceRun({
      contractKey: "persistent_screen",
      trigger: "scheduled",
      scheduledFor,
      startedAt: screenStartedAt,
      outcome: screenComplete ? "succeeded" : "partial",
      coverageStatus: screenComplete ? "complete" : "partial",
      recordsSeen: screen.screened,
      recordsUpdated: screen.screened,
      qualityChecks: { registry_entries: screen.registry },
      publicReasonCode: screenComplete ? null : "coverage_partial",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "screen failed";
    await recordSourceRun({
      contractKey: "persistent_screen",
      trigger: "scheduled",
      scheduledFor,
      startedAt: screenStartedAt,
      outcome: "failed",
      coverageStatus: "unknown",
      publicReasonCode: publicReasonForError(message),
      privateDiagnostic: message,
    });
    throw error;
  }

  const fusionStartedAt = new Date().toISOString();
  let fusion: PipelineResult["fusion"] = null;
  try {
    fusion = await fuseDetections();
    await recordSourceRun({
      contractKey: "fusion",
      trigger: "scheduled",
      scheduledFor,
      startedAt: fusionStartedAt,
      outcome: "succeeded",
      coverageStatus: "complete",
      recordsSeen: fusion.processed,
      recordsInserted: fusion.created,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "fusion failed";
    await recordSourceRun({
      contractKey: "fusion",
      trigger: "scheduled",
      scheduledFor,
      startedAt: fusionStartedAt,
      outcome: "failed",
      coverageStatus: "unknown",
      publicReasonCode: "dependency_failed",
      privateDiagnostic: message,
    });
  }

  let winds = 0;
  await flagPersistentCandidates();

  const windStartedAt = new Date().toISOString();
  try {
    winds = await enrichClusterWinds();
    await recordSourceRun({
      contractKey: "openmeteo_wind",
      trigger: "scheduled",
      scheduledFor,
      startedAt: windStartedAt,
      outcome: "succeeded",
      coverageStatus: "complete",
      recordsSeen: winds,
      recordsUpdated: winds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "weather failed";
    await recordSourceRun({
      contractKey: "openmeteo_wind",
      trigger: "scheduled",
      scheduledFor,
      startedAt: windStartedAt,
      outcome: "failed",
      coverageStatus: "unknown",
      publicReasonCode: publicReasonForError(message),
      privateDiagnostic: message,
    });
  }

  const broadcastStartedAt = new Date().toISOString();
  let broadcast: PipelineResult["broadcast"] = null;
  try {
    broadcast = await publishBroadcasts();
    await recordSourceRun({
      contractKey: "broadcast_publish",
      trigger: "scheduled",
      scheduledFor,
      startedAt: broadcastStartedAt,
      outcome: "succeeded",
      coverageStatus: "complete",
      recordsSeen: broadcast.published + broadcast.suppressed,
      recordsInserted: broadcast.published,
      qualityChecks: { suppressed: broadcast.suppressed },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "broadcast failed";
    await recordSourceRun({
      contractKey: "broadcast_publish",
      trigger: "scheduled",
      scheduledFor,
      startedAt: broadcastStartedAt,
      outcome: "failed",
      coverageStatus: "unknown",
      publicReasonCode: publicReasonForError(message),
      privateDiagnostic: message,
    });
  }

  const deliveryStartedAt = new Date().toISOString();
  let delivery: PipelineResult["delivery"] = null;
  try {
    delivery = await deliverBroadcasts();
    const deliveryOutcome = deliveryRunOutcome(delivery);
    await recordSourceRun({
      contractKey: "broadcast_delivery",
      trigger: "scheduled",
      scheduledFor,
      startedAt: deliveryStartedAt,
      ...deliveryOutcome,
      recordsSeen: delivery.rows + delivery.telegramRows,
      recordsUpdated: delivery.sent + delivery.telegramSent,
      qualityChecks: {
        fcm_configured: delivery.fcmConfigured,
        telegram_configured: delivery.telegramConfigured,
        telegram_channels: delivery.telegramChannels,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "delivery failed";
    await recordSourceRun({
      contractKey: "broadcast_delivery",
      trigger: "scheduled",
      scheduledFor,
      startedAt: deliveryStartedAt,
      outcome: "failed",
      coverageStatus: "unknown",
      publicReasonCode: "delivery_failed",
      privateDiagnostic: message,
    });
  }

  return { firms, fci, fusion, winds, broadcast, delivery };
}

/** Daily FWI outlook refresh, plus the EFFIS external cross-check. */
export async function runRiskPipeline() {
  const runNow = new Date();
  const scheduledFor = runNow.toISOString();
  const baseDate = algiersToday(runNow);
  const riskStartedAt = new Date().toISOString();
  const risk = await refreshRiskForecasts({
    snapshotId: crypto.randomUUID(),
    baseDate,
    scheduledFor,
  });
  const riskExpected = risk.communes * 6;
  const missingGeography = risk.communes === 0 && !risk.error;
  const riskHealth = risk.superseded
    ? ({ outcome: "skipped", coverageStatus: "complete" } as const)
    : sourceRunOutcome({
        accepted: risk.rows,
        expected: riskExpected,
        error:
          risk.error ?? (missingGeography ? "no communes available" : null),
      });
  const validDate = `${baseDate}T00:00:00.000Z`;
  await recordSourceRun({
    contractKey: "local_fwi",
    trigger: "scheduled",
    scheduledFor,
    startedAt: riskStartedAt,
    ...riskHealth,
    dataThrough: validDate,
    publishedAt: risk.publishedAt ?? null,
    recordsSeen: risk.rows,
    recordsInserted: risk.superseded ? 0 : risk.rows,
    recordsExpected: riskExpected || null,
    qualityChecks: {
      communes: risk.communes,
      horizon_days: 6,
      superseded: risk.superseded ?? false,
    },
    publicReasonCode: risk.error
      ? publicReasonForError(risk.error)
      : missingGeography
        ? "dependency_failed"
        : riskHealth.outcome === "partial"
          ? "coverage_partial"
          : null,
    privateDiagnostic:
      risk.error ?? (missingGeography ? "no communes available" : null),
  });

  const effisStartedAt = new Date().toISOString();
  const effis = await ingestEffis().catch((e): EffisRun => ({
    communes: 0,
    classified: 0,
    error: e instanceof Error ? e.message : String(e),
  }));
  const effisHealth = sourceRunOutcome({
    accepted: effis.classified,
    expected: effis.communes || null,
    error: effis.error,
  });
  await recordSourceRun({
    contractKey: "effis",
    trigger: "scheduled",
    scheduledFor,
    startedAt: effisStartedAt,
    ...effisHealth,
    dataThrough: validDate,
    recordsSeen: effis.communes,
    recordsInserted: effis.classified,
    recordsExpected: effis.communes || null,
    qualityChecks: { communes_classified: effis.classified },
    publicReasonCode: effis.error
      ? publicReasonForError(effis.error)
      : effisHealth.outcome === "partial"
        ? "coverage_partial"
        : null,
    privateDiagnostic: effis.error ?? null,
  });

  // The workflow greps this JSON for "error": EFFIS failure must only degrade
  // its own health row, never fail the FWI refresh — so no error string here.
  return { ...risk, effisClassified: effis.classified };
}
