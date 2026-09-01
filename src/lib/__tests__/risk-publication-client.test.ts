import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: fromMock },
}));

import { riskForecastsQuery } from "@/lib/nadhir";

type Result = { data: unknown; error: { message: string } | null };

function query(result: Result, filters: [string, unknown][] = []) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "order", "limit", "or", "range"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder["eq"] = vi.fn((column: string, value: unknown) => {
    filters.push([column, value]);
    return builder;
  });
  builder["maybeSingle"] = vi.fn(async () => result);
  builder["then"] = (resolve: (value: Result) => unknown) =>
    Promise.resolve(result).then(resolve);
  return builder;
}

async function runRiskQuery() {
  const queryFn = riskForecastsQuery.queryFn as () => Promise<unknown>;
  return queryFn();
}

describe("riskForecastsQuery publication boundary", () => {
  beforeEach(() => fromMock.mockReset());

  it("returns no forecasts when local_fwi has no published checkpoint", async () => {
    let riskReads = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === "risk_publication_checkpoint")
        return query({ data: null, error: null });
      riskReads += 1;
      return query({
        data: [
          {
            id: "partial",
            commune_id: "c1",
            forecast_date: "2026-09-02",
            horizon_days: 0,
            source: "local_fwi",
            fwi: 55,
            danger_level: 5,
            fuel_limited: false,
          },
        ],
        error: null,
      });
    });

    await expect(runRiskQuery()).resolves.toEqual([]);
    expect(riskReads).toBe(0);
  });

  it("rejects a partial checkpoint even when it retains older publication dates", async () => {
    let riskReads = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === "risk_publication_checkpoint") {
        return query({
          data: {
            coverage_status: "partial",
            snapshot_id: "f0220000-0000-4000-8000-000000000009",
            base_date: "2026-08-31",
            published_at: "2026-08-31T00:20:00.000Z",
          },
          error: null,
        });
      }
      riskReads += 1;
      return query({ data: [], error: null });
    });

    await expect(runRiskQuery()).resolves.toEqual([]);
    expect(riskReads).toBe(0);
  });

  it("pins all six pairs to the published complete base and ignores newer partial rows", async () => {
    const riskFilters: [string, unknown][] = [];
    let riskBuilder: Record<string, unknown> | undefined;
    fromMock.mockImplementation((table: string) => {
      if (table === "risk_publication_checkpoint") {
        return query({
          data: {
            coverage_status: "complete",
            snapshot_id: "f0220000-0000-4000-8000-000000000001",
            base_date: "2026-08-31",
            published_at: "2026-08-31T00:20:00.000Z",
          },
          error: null,
        });
      }
      riskBuilder = query(
        {
          data: [
            {
              id: "safe",
              commune_id: "c1",
              forecast_date: "2026-08-31",
              horizon_days: 0,
              source: "local_fwi",
              fwi: 25,
              danger_level: 3,
              fuel_limited: false,
            },
          ],
          error: null,
        },
        riskFilters,
      );
      return riskBuilder;
    });

    await expect(runRiskQuery()).resolves.toMatchObject([
      { id: "safe", forecast_date: "2026-08-31" },
    ]);
    expect(riskFilters).toContainEqual(["source", "local_fwi"]);
    expect(riskFilters).toContainEqual([
      "snapshot_id",
      "f0220000-0000-4000-8000-000000000001",
    ]);
    expect(riskBuilder?.["or"]).toHaveBeenCalledWith(
      "and(forecast_date.eq.2026-08-31,horizon_days.eq.0)," +
        "and(forecast_date.eq.2026-09-01,horizon_days.eq.1)," +
        "and(forecast_date.eq.2026-09-02,horizon_days.eq.2)," +
        "and(forecast_date.eq.2026-09-03,horizon_days.eq.3)," +
        "and(forecast_date.eq.2026-09-04,horizon_days.eq.4)," +
        "and(forecast_date.eq.2026-09-05,horizon_days.eq.5)",
    );
  });
});
