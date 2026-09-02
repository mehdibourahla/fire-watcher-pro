import { describe, expect, it, vi } from "vitest";

import type { ClaimedSourceJob } from "@/lib/source-jobs";
import {
  createSourceRunners,
  RUNTIME_CONTRACT_KEYS,
  type SourceRunnerDependencies,
} from "@/lib/ingest/source-runners.server";

const job = (contractKey: string): ClaimedSourceJob => ({
  id: `job-${contractKey}`,
  contract_key: contractKey,
  contract_version: 1,
  trigger_kind: "scheduled",
  idempotency_key: `scheduled:${contractKey}:2026-08-31T20:00:00Z`,
  scheduled_for: "2026-08-31T20:00:00.000Z",
  data_from: "2026-08-31T19:50:00.000Z",
  data_through: "2026-08-31T20:00:00.000Z",
  dispatched_at: null,
  execution_target: "cloudflare",
  state: "running",
  enqueued_by: ["database"],
  available_at: "2026-08-31T20:00:00.000Z",
  attempt_count: 1,
  max_attempts: 3,
  retry_base_seconds: 30,
  retry_until: "2026-08-31T20:30:00.000Z",
  gap_id: null,
  started_at: "2026-08-31T20:00:01.000Z",
  finished_at: null,
  last_error_at: null,
  last_public_reason_code: null,
  created_at: "2026-08-31T20:00:00.000Z",
  updated_at: "2026-08-31T20:00:01.000Z",
});

function dependencies() {
  return {
    ingestFirms: vi.fn().mockResolvedValue({
      fetched: 2,
      inserted: 1,
      feeds: ["VIIRS:2"],
      dataFrom: "2026-08-31T19:52:00.000Z",
      dataThrough: "2026-08-31T19:58:00.000Z",
    }),
    ingestFci: vi.fn().mockResolvedValue({
      fetched: 4,
      inserted: 2,
      outside: 1,
      filtered: 1,
      latestSlot: "2026-08-31T19:50:00.000Z",
      ageMinutes: 10,
    }),
    ingestS3: vi.fn().mockResolvedValue({
      fetched: 3,
      inserted: 3,
      outside: 0,
      filtered: 0,
      latestSlot: "2026-08-31T21:16:00Z",
      ageMinutes: 95,
    }),
    ingestOnm: vi.fn().mockResolvedValue({
      fetched: 2,
      stored: 2,
      unmatched: 0,
      detailed: 2,
    }),
    screenPersistentSources: vi
      .fn()
      .mockResolvedValue({ screened: 4, registry: 10 }),
    fuseDetections: vi.fn().mockResolvedValue({
      processed: 5,
      clustersTouched: 3,
      created: 2,
      resolved: 1,
    }),
    flagPersistentCandidates: vi.fn().mockResolvedValue({ flagged: 1 }),
    enrichClusterWinds: vi.fn().mockResolvedValue(3),
    refreshRiskForecasts: vi
      .fn()
      .mockResolvedValue({ communes: 2, rows: 12, requests: 1 }),
    ingestEffis: vi.fn().mockResolvedValue({ communes: 2, classified: 2 }),
    evaluateAlerts: vi.fn().mockResolvedValue({
      evaluated: 4,
      created: 1,
      suppressed: 2,
      sent: 1,
      failed: 0,
    }),
    publishBroadcasts: vi
      .fn()
      .mockResolvedValue({ published: 2, suppressed: 1 }),
    deliverBroadcasts: vi.fn().mockResolvedValue({
      rows: 2,
      sent: 2,
      telegramRows: 2,
      telegramSent: 2,
      telegramChannels: 1,
      fcmConfigured: true,
      telegramConfigured: true,
      disabled: false,
    }),
  } satisfies SourceRunnerDependencies;
}

describe("source runner registry", () => {
  it("contains exactly one runner for every runtime contract", () => {
    expect(Object.keys(createSourceRunners(dependencies())).sort()).toEqual(
      [...RUNTIME_CONTRACT_KEYS].sort(),
    );
  });

  it("maps every adapter result into its own structured run", async () => {
    const deps = dependencies();
    const runners = createSourceRunners(deps);

    const results = await Promise.all(
      RUNTIME_CONTRACT_KEYS.map((key) => runners[key](job(key))),
    );

    expect(results.map((result) => result.contractKey)).toEqual(
      RUNTIME_CONTRACT_KEYS,
    );
    expect(results.every((result) => result.outcome === "succeeded")).toBe(
      true,
    );
    expect(results.every((result) => result.retryDisposition === "none")).toBe(
      true,
    );
    expect(deps.flagPersistentCandidates).toHaveBeenCalledOnce();
    expect(
      results.find((result) => result.contractKey === "firms"),
    ).toMatchObject({
      recordsSeen: 2,
      recordsInserted: 1,
      dataFrom: "2026-08-31T19:52:00.000Z",
      dataThrough: "2026-08-31T19:58:00.000Z",
    });
    expect(
      results.find((result) => result.contractKey === "fci"),
    ).toMatchObject({
      upstreamPublishedAt: "2026-08-31T19:50:00.000Z",
      recordsRejected: 2,
      qualityChecks: expect.objectContaining({ outside_watch_area: 1 }),
    });
    expect(
      results.find((result) => result.contractKey === "broadcast_delivery"),
    ).toMatchObject({ recordsSeen: 4, recordsUpdated: 4 });
  });

  it("keeps an under-covered adapter result partial and retryable", async () => {
    const deps = dependencies();
    deps.ingestOnm.mockResolvedValue({
      fetched: 3,
      stored: 3,
      unmatched: 1,
    });

    await expect(
      createSourceRunners(deps).onm(job("onm")),
    ).resolves.toMatchObject({
      outcome: "partial",
      coverageStatus: "partial",
      publicReasonCode: "coverage_partial",
      retryDisposition: "transient",
    });
  });

  it("contains raw adapter errors only in the private diagnostic", async () => {
    const deps = dependencies();
    deps.ingestFci.mockResolvedValue({
      fetched: 0,
      inserted: 0,
      outside: 0,
      filtered: 0,
      latestSlot: null,
      ageMinutes: null,
      error: "https://secret.provider.invalid returned token=private",
    });

    const result = await createSourceRunners(deps).fci(job("fci"));

    expect(result.publicReasonCode).toBe("upstream_unreachable");
    expect(result.privateDiagnostic).toContain("secret.provider.invalid");
    expect(JSON.stringify(result.publicReasonCode)).not.toContain("private");
  });

  it("runs Sentinel-3 through the same WFS report shape as FCI", async () => {
    const deps = dependencies();
    const result = await createSourceRunners(deps).s3_slstr(job("s3_slstr"));
    expect(result.outcome).toBe("succeeded");
    expect(result.upstreamPublishedAt).toBe("2026-08-31T21:16:00Z");
    expect(result.recordsInserted).toBe(3);
    expect(result.qualityChecks).toMatchObject({ latest_slot_age_minutes: 95 });
  });

  it("passes the recorded interval to replay-capable source adapters", async () => {
    const deps = dependencies();
    const replayInterval = {
      dataFrom: "2026-08-31T19:50:00.000Z",
      dataThrough: "2026-08-31T20:00:00.000Z",
    };

    await createSourceRunners(deps).firms({
      ...job("firms"),
      trigger_kind: "replay",
    });
    await createSourceRunners(deps).fci({
      ...job("fci"),
      trigger_kind: "replay",
    });

    expect(deps.ingestFirms).toHaveBeenCalledWith(replayInterval);
    expect(deps.ingestFci).toHaveBeenCalledWith(replayInterval);
  });

  it("does not let an optional wind failure call or block another runner", async () => {
    const deps = dependencies();
    deps.enrichClusterWinds.mockRejectedValue(
      new Error("open-meteo unavailable"),
    );
    const runners = createSourceRunners(deps);

    await expect(runners.openmeteo_wind(job("openmeteo_wind"))).rejects.toThrow(
      "open-meteo unavailable",
    );
    await expect(
      runners.broadcast_publish(job("broadcast_publish")),
    ).resolves.toMatchObject({ outcome: "succeeded" });
    expect(deps.publishBroadcasts).toHaveBeenCalledOnce();
  });

  // the slot, not the clock: a refresh that starts before Algiers midnight and
  // finishes after it must still publish under the day the job was scheduled for
  it("derives the risk base date from the job slot", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T23:30:00.000Z"));
    const deps = dependencies();

    await createSourceRunners(deps).local_fwi({
      ...job("local_fwi"),
      scheduled_for: "2026-08-31T22:59:59.900Z",
    });

    expect(deps.refreshRiskForecasts).toHaveBeenCalledWith({
      snapshotId: expect.any(String),
      baseDate: "2026-08-31",
      scheduledFor: "2026-08-31T22:59:59.900Z",
    });
    vi.useRealTimers();
  });
});
