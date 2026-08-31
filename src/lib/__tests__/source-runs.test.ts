import { describe, expect, it, vi } from "vitest";

import {
  publicReasonForError,
  sourceRunIdempotencyKey,
  sourceRunOutcome,
  sourceRunRpcArgs,
} from "@/lib/source-runs";
import { recordSourceRunWith } from "@/lib/source-runs.server";

describe("publicReasonForError", () => {
  it.each([
    ["FIRMS_MAP_KEY missing", "credentials_missing"],
    ["TELEGRAM_BOT_TOKEN not configured", "credentials_missing"],
    ["FCI WFS 503", "upstream_unreachable"],
    ["network fetch failed", "upstream_unreachable"],
    [
      "every FCI feature fell outside the watch box — axis order changed",
      "schema_invalid",
    ],
    ["malformed provider payload", "schema_invalid"],
    ["unexpected database failure", "internal_error"],
  ] as const)("maps %s to %s", (diagnostic, expected) => {
    expect(publicReasonForError(diagnostic)).toBe(expected);
  });

  it("never returns raw diagnostic text", () => {
    const diagnostic =
      "https://provider.invalid/feed?token=secret returned private account 42";

    const reason = publicReasonForError(diagnostic);

    expect(reason).toBe("upstream_unreachable");
    expect(reason).not.toContain("provider.invalid");
    expect(reason).not.toContain("secret");
    expect(reason).not.toContain("42");
  });
});

describe("sourceRunIdempotencyKey", () => {
  it("is stable for the same contract, trigger, and scheduled interval", () => {
    expect(
      sourceRunIdempotencyKey("firms", "scheduled", "2026-08-31T12:10:00.000Z"),
    ).toBe("firms:scheduled:2026-08-31T12:10:00.000Z");
  });

  it("changes when the scheduled interval changes", () => {
    expect(
      sourceRunIdempotencyKey("firms", "scheduled", "2026-08-31T12:20:00.000Z"),
    ).not.toBe("firms:scheduled:2026-08-31T12:10:00.000Z");
  });
});

describe("sourceRunOutcome", () => {
  it("accepts a successful empty poll as complete", () => {
    expect(sourceRunOutcome({ accepted: 0 })).toEqual({
      outcome: "succeeded",
      coverageStatus: "complete",
    });
  });

  it("fails an errored run that accepted nothing", () => {
    expect(sourceRunOutcome({ accepted: 0, error: "upstream failed" })).toEqual(
      {
        outcome: "failed",
        coverageStatus: "unknown",
      },
    );
  });

  it("marks an errored run with accepted data as partial", () => {
    expect(
      sourceRunOutcome({ accepted: 200, expected: 300, error: "quota" }),
    ).toEqual({
      outcome: "partial",
      coverageStatus: "partial",
    });
  });

  it("marks under-coverage as partial without requiring an exception", () => {
    expect(sourceRunOutcome({ accepted: 200, expected: 300 })).toEqual({
      outcome: "partial",
      coverageStatus: "partial",
    });
  });

  it("does not count an operator-disabled run as successful validation", () => {
    expect(sourceRunOutcome({ accepted: 0, disabled: true })).toEqual({
      outcome: "skipped",
      coverageStatus: "unknown",
    });
  });
});

describe("sourceRunRpcArgs", () => {
  it("maps a report to the atomic database function without exposing extra fields", () => {
    expect(
      sourceRunRpcArgs(
        {
          contractKey: "fci",
          trigger: "scheduled",
          scheduledFor: "2026-08-31T12:10:00.000Z",
          startedAt: "2026-08-31T12:10:01.000Z",
          outcome: "succeeded",
          upstreamPublishedAt: "2026-08-31T12:00:00.000Z",
          dataThrough: "2026-08-31T12:00:00.000Z",
          recordsSeen: 4,
          recordsInserted: 2,
          recordsRejected: 1,
          coverageStatus: "complete",
          qualityChecks: { inside_watch_box: true },
        },
        "2026-08-31T12:10:03.000Z",
      ),
    ).toEqual({
      _contract_key: "fci",
      _trigger_kind: "scheduled",
      _idempotency_key: "fci:scheduled:2026-08-31T12:10:00.000Z",
      _scheduled_for: "2026-08-31T12:10:00.000Z",
      _started_at: "2026-08-31T12:10:01.000Z",
      _finished_at: "2026-08-31T12:10:03.000Z",
      _outcome: "succeeded",
      _upstream_published_at: "2026-08-31T12:00:00.000Z",
      _data_from: null,
      _data_through: "2026-08-31T12:00:00.000Z",
      _validated_at: "2026-08-31T12:10:03.000Z",
      _published_at: "2026-08-31T12:10:03.000Z",
      _records_seen: 4,
      _records_inserted: 2,
      _records_updated: 0,
      _records_rejected: 1,
      _records_expected: null,
      _coverage_status: "complete",
      _quality_checks: { inside_watch_box: true },
      _public_reason_code: null,
      _private_diagnostic: null,
    });
  });

  it("does not invent validation or publication times for a failed run", () => {
    const args = sourceRunRpcArgs(
      {
        contractKey: "firms",
        trigger: "scheduled",
        scheduledFor: "2026-08-31T12:10:00.000Z",
        startedAt: "2026-08-31T12:10:01.000Z",
        outcome: "failed",
        coverageStatus: "unknown",
        publicReasonCode: "upstream_unreachable",
        privateDiagnostic: "private provider failure",
      },
      "2026-08-31T12:10:03.000Z",
    );

    expect(args._validated_at).toBeNull();
    expect(args._published_at).toBeNull();
    expect(args._public_reason_code).toBe("upstream_unreachable");
    expect(args._private_diagnostic).toBe("private provider failure");
  });
});

describe("recordSourceRunWith", () => {
  const report = {
    contractKey: "firms",
    trigger: "scheduled" as const,
    scheduledFor: "2026-08-31T12:10:00.000Z",
    startedAt: "2026-08-31T12:10:01.000Z",
    outcome: "succeeded" as const,
    coverageStatus: "complete" as const,
  };

  it("sends the typed report to the atomic recorder", async () => {
    const calls: { name: string; args: unknown }[] = [];
    const client = {
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args });
        return { error: null };
      },
    };

    await expect(
      recordSourceRunWith(client, report, "2026-08-31T12:10:03.000Z"),
    ).resolves.toBe(true);
    expect(calls).toEqual([
      {
        name: "record_source_run",
        args: expect.objectContaining({
          _contract_key: "firms",
          _idempotency_key: "firms:scheduled:2026-08-31T12:10:00.000Z",
        }),
      },
    ]);
  });

  it("returns false when observability fails without throwing into ingest", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = {
      rpc: async () => ({ error: { message: "database unavailable" } }),
    };

    await expect(
      recordSourceRunWith(client, report, "2026-08-31T12:10:03.000Z"),
    ).resolves.toBe(false);
    warning.mockRestore();
  });
});
