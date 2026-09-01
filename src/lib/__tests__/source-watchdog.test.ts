import { describe, expect, it } from "vitest";

import {
  evaluateSourceWatchdog,
  type SourceWatchdogIssue,
} from "@/lib/source-watchdog";

const issue = (
  issueCode: SourceWatchdogIssue["issue_code"],
): SourceWatchdogIssue & { private_diagnostic: string } => ({
  contract_key: "firms",
  issue_code: issueCode,
  scheduled_for: "2026-08-31T20:00:00.000Z",
  lease_expires_at: null,
  observed_at: "2026-08-31T20:20:00.000Z",
  private_diagnostic: "token=private provider payload",
});

describe("evaluateSourceWatchdog", () => {
  it("exits zero when every source execution contract is healthy", () => {
    expect(evaluateSourceWatchdog([])).toEqual({
      exitCode: 0,
      lines: ["source-watchdog healthy"],
    });
  });

  it.each([
    "missing_job",
    "queue_delayed",
    "lease_expired",
    "run_delayed",
  ] as const)("exits one for %s", (issueCode) => {
    const result = evaluateSourceWatchdog([issue(issueCode)]);

    expect(result.exitCode).toBe(1);
    expect(result.lines).toEqual([
      `contract=firms issue=${issueCode} scheduled_for=2026-08-31T20:00:00.000Z lease_expires_at=- observed_at=2026-08-31T20:20:00.000Z`,
    ]);
    expect(JSON.stringify(result)).not.toContain("token=private");
    expect(JSON.stringify(result)).not.toContain("provider payload");
  });
});
