import { describe, expect, it } from "vitest";

import {
  notifyOperatorOnWatchdog,
  type OperatorAlertDependencies,
} from "@/lib/ingest/operator-alerts.server";
import type { SourceWatchdogIssue } from "@/lib/source-watchdog";

const issue: SourceWatchdogIssue = {
  contract_key: "effis",
  issue_code: "run_delayed",
  scheduled_for: "2026-09-01T06:00:00+00:00",
  lease_expires_at: null,
  observed_at: "2026-09-01T18:25:19+00:00",
};

function deps(over: Partial<OperatorAlertDependencies> = {}) {
  const sent: string[] = [];
  const state: { fingerprint: string | null } = { fingerprint: null };
  const d: OperatorAlertDependencies = {
    chatId: "42",
    readIssues: async () => [issue],
    readFingerprint: async () => state.fingerprint,
    writeFingerprint: async (fp) => {
      state.fingerprint = fp;
    },
    send: async (_chatId, html) => {
      sent.push(html);
    },
    ...over,
  };
  return { d, sent, state };
}

describe("notifyOperatorOnWatchdog", () => {
  it("sends once on a new red state and persists the fingerprint", async () => {
    const { d, sent, state } = deps();
    const first = await notifyOperatorOnWatchdog(d);
    const second = await notifyOperatorOnWatchdog(d);
    expect(first).toEqual({ issues: 1, notified: true });
    expect(second).toEqual({ issues: 1, notified: false });
    expect(sent).toHaveLength(1);
    expect(state.fingerprint).toBe("effis:run_delayed");
  });

  it("does nothing but report when no operator chat is configured", async () => {
    const { d, sent, state } = deps({ chatId: null });
    const result = await notifyOperatorOnWatchdog(d);
    expect(result).toEqual({ issues: 1, notified: false });
    expect(sent).toHaveLength(0);
    expect(state.fingerprint).toBeNull();
  });

  it("does not persist a fingerprint if sending fails", async () => {
    const { d, state } = deps({
      send: async () => {
        throw new Error("telegram down");
      },
    });
    await expect(notifyOperatorOnWatchdog(d)).rejects.toThrow("telegram down");
    expect(state.fingerprint).toBeNull();
  });
});
