import { describe, expect, it } from "vitest";

import {
  archiveColdDays,
  type ColdArchiveDeps,
  type ColdTable,
  coldPath,
  exportSql,
  sha256,
  trialColdDay,
} from "@/lib/cold-archive";

const parquet = new Uint8Array([80, 65, 82, 49]);
const summary = { rows: 2, digest: "a".repeat(32) };

function fakes(overrides: Partial<ColdArchiveDeps> = {}) {
  const commits: Parameters<ColdArchiveDeps["commit"]>[0][] = [];
  const uploads: string[] = [];
  const deps: ColdArchiveDeps = {
    pendingDays: async (table) =>
      table === "source_runs" || table === "source_jobs" ? ["2026-06-01"] : [],
    exportDay: async () => ({ file: summary, source: summary, bytes: parquet }),
    readBack: async () => summary,
    upload: async (path) => {
      uploads.push(path);
    },
    download: async () => parquet,
    commit: async (args) => {
      commits.push(args);
      return args.rows;
    },
    log: () => {},
    ...overrides,
  };
  return { deps, commits, uploads };
}

describe("archiveColdDays", () => {
  it("commits a proven day with its manifest, runs before jobs", async () => {
    const { deps, commits } = fakes();
    expect(await archiveColdDays(deps)).toBe(2);
    expect(commits.map((c) => c.table)).toEqual(["source_runs", "source_jobs"]);
    expect(commits[0]).toEqual({
      table: "source_runs",
      day: "2026-06-01",
      rows: 2,
      keyDigest: summary.digest,
      sha256: sha256(parquet),
      bytes: 4,
      path: "cold/source_runs/2026/06/01.parquet",
    });
  });

  it("records an empty day without a file", async () => {
    const empty = { rows: 0, digest: null };
    const { deps, commits, uploads } = fakes({
      exportDay: async () => ({ file: empty, source: empty, bytes: parquet }),
    });
    await archiveColdDays(deps);
    expect(uploads).toEqual([]);
    expect(commits[0]).toMatchObject({
      rows: 0,
      keyDigest: null,
      path: null,
      sha256: null,
    });
  });

  it.each([
    [
      "the file disagrees with the database",
      {
        exportDay: async () => ({
          file: summary,
          source: { rows: 3, digest: summary.digest },
          bytes: parquet,
        }),
      },
    ],
    ["the stored bytes differ", { download: async () => new Uint8Array([0]) }],
    [
      "the stored file reads back differently",
      { readBack: async () => ({ rows: 2, digest: "b".repeat(32) }) },
    ],
  ] as [string, Partial<ColdArchiveDeps>][])(
    "deletes nothing when %s",
    async (_, override) => {
      const { deps, commits } = fakes(override);
      await expect(archiveColdDays(deps)).rejects.toThrow();
      expect(commits).toEqual([]);
    },
  );
});

describe("trialColdDay", () => {
  it("proves a day under trial/ and never commits", async () => {
    const { deps, commits, uploads } = fakes();
    await trialColdDay(deps, "risk_forecasts", "2026-08-28");
    expect(uploads).toEqual(["trial/risk_forecasts/2026/08/28.parquet"]);
    expect(commits).toEqual([]);
  });
});

describe("export inputs", () => {
  it("builds only the archive layout and refuses unsafe input", () => {
    expect(coldPath("cold", "broadcast_audit", "2026-11-26")).toBe(
      "cold/broadcast_audit/2026/11/26.parquet",
    );
    expect(() =>
      coldPath("cold", "broadcast_audit", "2026-11-26'; --"),
    ).toThrow();
    expect(() =>
      exportSql("alerts; drop table x" as ColdTable, "2026-11-26", "a", "b"),
    ).toThrow();
  });
});
