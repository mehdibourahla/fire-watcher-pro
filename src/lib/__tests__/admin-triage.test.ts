import { describe, expect, it } from "vitest";

import { adminEn } from "@/i18n/admin/en";
import { rankTriage, type TriageInput } from "@/lib/admin-triage";

const quiet: TriageInput = {
  killSwitchEngaged: false,
  staleSources: [],
  riskUnpublished: false,
  firesAwaiting: 0,
  translationsUnapplied: 0,
  queueDepth: 0,
};

describe("rankTriage", () => {
  it("returns nothing when the system is current", () => {
    expect(rankTriage(quiet)).toEqual([]);
  });

  it("puts the kill-switch above a deep queue", () => {
    const rows = rankTriage({
      ...quiet,
      killSwitchEngaged: true,
      queueDepth: 40,
    });
    expect(rows[0]?.key).toBe("killSwitch");
  });

  it("ranks a stale source above waiting queue items", () => {
    const rows = rankTriage({
      ...quiet,
      staleSources: ["FIRMS"],
      queueDepth: 12,
    });
    expect(rows.map((r) => r.key)).toEqual(["sourceStale", "queueDepth"]);
  });

  it("carries counts through for the copy to interpolate", () => {
    const rows = rankTriage({ ...quiet, firesAwaiting: 3 });
    expect(rows[0]).toEqual({ key: "firesAwaiting", severity: 2, count: 3 });
  });

  it("keeps the declared order within one severity", () => {
    const rows = rankTriage({
      ...quiet,
      killSwitchEngaged: true,
      staleSources: ["FIRMS"],
      riskUnpublished: true,
    });
    expect(rows.map((r) => r.key)).toEqual([
      "killSwitch",
      "sourceStale",
      "riskUnpublished",
    ]);
  });

  it("has copy for every row it can emit", () => {
    const rows = rankTriage({
      killSwitchEngaged: true,
      staleSources: ["FIRMS"],
      riskUnpublished: true,
      firesAwaiting: 1,
      translationsUnapplied: 1,
      queueDepth: 1,
    });
    for (const row of rows) expect(adminEn.triage).toHaveProperty(row.key);
  });
});
