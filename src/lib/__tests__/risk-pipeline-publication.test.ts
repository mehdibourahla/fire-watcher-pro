import { afterEach, describe, expect, it, vi } from "vitest";

const { refreshRiskForecasts, ingestEffis, recordSourceRun } = vi.hoisted(
  () => ({
    refreshRiskForecasts: vi.fn(),
    ingestEffis: vi.fn(),
    recordSourceRun: vi.fn(),
  }),
);

vi.mock("@/lib/ingest/weather.server", () => ({
  refreshRiskForecasts,
  enrichClusterWinds: vi.fn(),
}));
vi.mock("@/lib/ingest/effis.server", () => ({ ingestEffis }));
vi.mock("@/lib/source-runs.server", () => ({ recordSourceRun }));

import { runRiskPipeline } from "@/lib/ingest/pipeline.server";

describe("risk pipeline publication identity", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("captures one Algiers base before midnight and reports that same publication", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T22:59:59.900Z"));
    refreshRiskForecasts.mockImplementation(async (run) => {
      vi.setSystemTime(new Date("2026-08-31T23:00:00.100Z"));
      return {
        communes: 1,
        rows: 6,
        publishedAt: "2026-08-31T23:00:00.050Z",
        run,
      };
    });
    ingestEffis.mockResolvedValue({ communes: 0, classified: 0 });
    recordSourceRun.mockResolvedValue(undefined);

    await runRiskPipeline();

    expect(refreshRiskForecasts).toHaveBeenCalledWith({
      snapshotId: expect.any(String),
      baseDate: "2026-08-31",
      scheduledFor: "2026-08-31T22:59:59.900Z",
    });
    expect(recordSourceRun).toHaveBeenCalledWith(
      expect.objectContaining({
        contractKey: "local_fwi",
        scheduledFor: "2026-08-31T22:59:59.900Z",
        dataThrough: "2026-08-31T00:00:00.000Z",
        publishedAt: "2026-08-31T23:00:00.050Z",
      }),
    );
    expect(recordSourceRun).toHaveBeenCalledWith(
      expect.objectContaining({
        contractKey: "effis",
        dataThrough: "2026-08-31T00:00:00.000Z",
      }),
    );
  });
});
