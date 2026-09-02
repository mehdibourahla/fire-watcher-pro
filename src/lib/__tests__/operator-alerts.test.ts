import { describe, expect, it } from "vitest";

import { watchdogTransition } from "@/lib/operator-alerts";
import type { SourceWatchdogIssue } from "@/lib/source-watchdog";

function issue(over: Partial<SourceWatchdogIssue>): SourceWatchdogIssue {
  return {
    contract_key: "effis",
    issue_code: "run_delayed",
    scheduled_for: "2026-09-01T06:00:00+00:00",
    lease_expires_at: null,
    observed_at: "2026-09-01T18:25:19+00:00",
    ...over,
  };
}

describe("watchdogTransition", () => {
  it("is silent while the issue set is unchanged", () => {
    const issues = [issue({})];
    const first = watchdogTransition(null, issues);
    const again = watchdogTransition(first.fingerprint, issues);
    expect(again.message).toBeNull();
    expect(again.fingerprint).toBe(first.fingerprint);
  });

  it("stays silent when healthy and never notified before", () => {
    expect(watchdogTransition(null, [])).toEqual({
      fingerprint: "",
      message: null,
    });
  });

  it("announces new issues once, naming each contract and issue", () => {
    const { message } = watchdogTransition("", [
      issue({}),
      issue({ contract_key: "onm", issue_code: "queue_delayed" }),
    ]);
    expect(message).toContain("effis");
    expect(message).toContain("run_delayed");
    expect(message).toContain("onm");
    expect(message).toContain("queue_delayed");
  });

  it("orders the fingerprint so issue order does not retrigger", () => {
    const a = watchdogTransition(null, [
      issue({ contract_key: "a" }),
      issue({ contract_key: "b" }),
    ]);
    const b = watchdogTransition(a.fingerprint, [
      issue({ contract_key: "b" }),
      issue({ contract_key: "a" }),
    ]);
    expect(b.message).toBeNull();
  });

  it("never forwards private diagnostics from the watchdog row", () => {
    const leaky = {
      ...issue({}),
      private_diagnostic: "token=private provider payload",
    } as SourceWatchdogIssue;
    const { message } = watchdogTransition(null, [leaky]);
    expect(message).not.toContain("token=private");
    expect(message).not.toContain("provider payload");
  });

  it("announces recovery once when the set empties", () => {
    const red = watchdogTransition(null, [issue({})]);
    const green = watchdogTransition(red.fingerprint, []);
    expect(green.fingerprint).toBe("");
    expect(green.message).toMatch(/recovered/i);
  });
});
