import { describe, expect, it } from "vitest";

import { externalWatchdogIssues } from "@/lib/external-watchdog";
import { watchdogTransition } from "@/lib/operator-alerts";

const now = Date.parse("2026-09-02T22:00:00Z");
const iso = (minutesAgo: number) =>
  new Date(now - minutesAgo * 60_000).toISOString();

describe("externalWatchdogIssues", () => {
  it("passes the view's issues through when the Worker is running", () => {
    const view = [
      {
        contract_key: "firms",
        issue_code: "run_delayed",
        scheduled_for: null,
        lease_expires_at: null,
        observed_at: null,
      },
    ];
    expect(
      externalWatchdogIssues({
        viewIssues: view,
        lastWorkerRunAt: iso(3),
        now,
      }),
    ).toEqual(view);
  });

  it("reports the silence the in-Worker watchdog cannot", () => {
    const issues = externalWatchdogIssues({
      viewIssues: [],
      lastWorkerRunAt: iso(40),
      now,
    });
    expect(issues.map((i) => i.issue_code)).toEqual(["worker_silent"]);
    expect(issues[0]!.observed_at).toBe(iso(40));
  });

  it("treats a Worker that has never run as silent", () => {
    expect(
      externalWatchdogIssues({
        viewIssues: [],
        lastWorkerRunAt: null,
        now,
      }).map((i) => i.issue_code),
    ).toEqual(["worker_silent"]);
  });

  it("announces the silence once and recovery once", () => {
    const silent = externalWatchdogIssues({
      viewIssues: [],
      lastWorkerRunAt: iso(40),
      now,
    });
    const first = watchdogTransition(null, silent);
    expect(first.message).toContain("worker_silent");
    expect(watchdogTransition(first.fingerprint, silent).message).toBeNull();
    const back = watchdogTransition(first.fingerprint, []);
    expect(back.message).toContain("recovered");
  });
});
