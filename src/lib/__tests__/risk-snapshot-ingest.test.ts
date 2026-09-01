import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, rpcMock, dailyFromHourlyMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  dailyFromHourlyMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: fromMock, rpc: rpcMock },
}));

vi.mock("@/lib/ingest/noon-weather", () => ({
  dailyFromHourly: dailyFromHourlyMock,
}));

import { refreshRiskForecasts } from "@/lib/ingest/weather.server";

const SNAPSHOT_ID = "f0220000-0000-4000-8000-000000000010";
const RUN = {
  snapshotId: SNAPSHOT_ID,
  baseDate: "2026-08-31",
  scheduledFor: "2026-08-31T12:00:00.000Z",
};
const DAYS = [
  "2026-08-31",
  "2026-09-01",
  "2026-09-02",
  "2026-09-03",
  "2026-09-04",
  "2026-09-05",
];

function query(result: { data: unknown; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "delete", "lt", "update"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder["range"] = vi.fn(async () => result);
  builder["then"] = (resolve: (value: typeof result) => unknown) =>
    Promise.resolve(result).then(resolve);
  return builder;
}

function commune(id: number) {
  return {
    id: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
    lat: 35 + id / 100,
    lon: 2 + id / 100,
    forest_fraction: 0.2,
    landcover: null,
  };
}

describe("risk snapshot ingest", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00.000Z"));
    fromMock.mockReset();
    rpcMock.mockReset();
    dailyFromHourlyMock.mockReturnValue({
      time: DAYS,
      temperature_2m_max: DAYS.map(() => 30),
      relative_humidity_2m_min: DAYS.map(() => 35),
      wind_speed_10m_max: DAYS.map(() => 15),
      wind_direction_10m_dominant: DAYS.map(() => 180),
      precipitation_sum: DAYS.map(() => 0),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("stages every batch and promotes only after the complete generation exists", async () => {
    const staged: unknown[][] = [];
    const tables: string[] = [];
    const communes = Array.from({ length: 26 }, (_, i) => commune(i + 1));
    fromMock.mockImplementation((table: string) => {
      tables.push(table);
      if (table === "admin_units")
        return query({ data: communes, error: null });
      if (table === "fwi_state") return query({ data: [], error: null });
      const builder = query({ data: null, error: null });
      builder["upsert"] = vi.fn(async (rows: unknown[]) => {
        staged.push(rows);
        return { data: null, error: null };
      });
      return builder;
    });
    rpcMock.mockImplementation((name: string, args: Record<string, unknown>) =>
      Promise.resolve(
        name === "begin_risk_forecast_snapshot"
          ? { data: 0, error: null }
          : name === "stage_risk_forecast_batch"
            ? (staged.push(args["_rows"] as unknown[]),
              { data: 156, error: null })
            : {
                data: {
                  status: "promoted",
                  rows: 156,
                  snapshot_id: SNAPSHOT_ID,
                  base_date: RUN.baseDate,
                  published_at: "2026-08-31T12:05:00.000Z",
                },
                error: null,
              },
      ),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL) => {
        const count = input.searchParams.get("latitude")!.split(",").length;
        return new Response(
          JSON.stringify(Array.from({ length: count }, () => ({ hourly: {} }))),
        );
      }),
    );

    const promise = refreshRiskForecasts(RUN);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({
      communes: 26,
      rows: 156,
      publishedAt: "2026-08-31T12:05:00.000Z",
    });
    expect(tables).not.toContain("risk_forecasts");
    expect(tables).not.toContain("risk_forecast_staging");
    expect(tables).not.toContain("risk_forecast_snapshot_runs");
    expect(staged.flat()).toHaveLength(156);
    expect(staged.flat()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ snapshot_id: SNAPSHOT_ID }),
      ]),
    );
    expect(rpcMock).toHaveBeenCalledWith("publish_risk_forecast_snapshot", {
      _snapshot_id: SNAPSHOT_ID,
      _base_date: RUN.baseDate,
      _scheduled_for: RUN.scheduledFor,
    });
    expect(rpcMock).toHaveBeenCalledWith("stage_risk_forecast_batch", {
      _snapshot_id: SNAPSHOT_ID,
      _rows: expect.any(Array),
    });
    expect(rpcMock).toHaveBeenCalledWith("begin_risk_forecast_snapshot", {
      _snapshot_id: SNAPSHOT_ID,
      _base_date: RUN.baseDate,
      _scheduled_for: RUN.scheduledFor,
      _stale_before: expect.any(String),
    });
  });

  it("discards an interrupted generation without promoting it", async () => {
    const deletes: Record<string, unknown>[] = [];
    const communes = Array.from({ length: 26 }, (_, i) => commune(i + 1));
    fromMock.mockImplementation((table: string) => {
      if (table === "admin_units")
        return query({ data: communes, error: null });
      if (table === "fwi_state") return query({ data: [], error: null });
      const builder = query({ data: null, error: null });
      builder["upsert"] = vi.fn(async () => ({ data: null, error: null }));
      builder["delete"] = vi.fn(() => {
        deletes.push(builder);
        return builder;
      });
      return builder;
    });
    let request = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL) => {
        request += 1;
        if (request === 2) return new Response(null, { status: 400 });
        const count = input.searchParams.get("latitude")!.split(",").length;
        return new Response(
          JSON.stringify(Array.from({ length: count }, () => ({ hourly: {} }))),
        );
      }),
    );

    rpcMock.mockImplementation((name: string) =>
      Promise.resolve(
        name === "discard_risk_forecast_snapshot"
          ? { data: true, error: null }
          : { data: 0, error: null },
      ),
    );
    const promise = refreshRiskForecasts(RUN);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toMatchObject({ communes: 26, rows: 150 });
    expect(result.error).toContain("open-meteo 400");
    expect(rpcMock).not.toHaveBeenCalledWith(
      "publish_risk_forecast_snapshot",
      expect.anything(),
    );
    expect(deletes).toHaveLength(0);
    expect(rpcMock).toHaveBeenCalledWith("discard_risk_forecast_snapshot", {
      _snapshot_id: SNAPSHOT_ID,
      _base_date: RUN.baseDate,
      _scheduled_for: RUN.scheduledFor,
    });
  });

  it("records a promotion failure and discards its staged generation", async () => {
    const deletes: Record<string, unknown>[] = [];
    fromMock.mockImplementation((table: string) => {
      if (table === "admin_units")
        return query({ data: [commune(1)], error: null });
      if (table === "fwi_state") return query({ data: [], error: null });
      const builder = query({ data: null, error: null });
      builder["upsert"] = vi.fn(async () => ({ data: null, error: null }));
      builder["delete"] = vi.fn(() => {
        deletes.push(builder);
        return builder;
      });
      return builder;
    });
    rpcMock.mockImplementation((name: string) =>
      Promise.resolve(
        name === "publish_risk_forecast_snapshot"
          ? { data: null, error: { message: "incomplete_risk_snapshot" } }
          : name === "discard_risk_forecast_snapshot"
            ? { data: true, error: null }
            : { data: 0, error: null },
      ),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify([{ hourly: {} }]), { status: 200 }),
      ),
    );

    const result = await refreshRiskForecasts(RUN);

    expect(result.error).toContain("incomplete_risk_snapshot");
    expect(deletes).toHaveLength(0);
    expect(rpcMock).toHaveBeenCalledWith("discard_risk_forecast_snapshot", {
      _snapshot_id: SNAPSHOT_ID,
      _base_date: RUN.baseDate,
      _scheduled_for: RUN.scheduledFor,
    });
  });

  it("reports a monotonic supersession without claiming publication", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "admin_units")
        return query({ data: [commune(1)], error: null });
      if (table === "fwi_state") return query({ data: [], error: null });
      const builder = query({ data: null, error: null });
      builder["upsert"] = vi.fn(async () => ({ data: null, error: null }));
      builder["update"] = vi.fn(() => builder);
      return builder;
    });
    rpcMock.mockImplementation((name: string) =>
      Promise.resolve(
        name === "publish_risk_forecast_snapshot"
          ? {
              data: {
                status: "superseded",
                rows: 0,
                snapshot_id: SNAPSHOT_ID,
                base_date: RUN.baseDate,
                published_at: null,
              },
              error: null,
            }
          : { data: 0, error: null },
      ),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([{ hourly: {} }]))),
    );

    const result = await refreshRiskForecasts(RUN);

    expect(result).toMatchObject({ rows: 6, superseded: true });
    expect(result).not.toHaveProperty("publishedAt");
  });
});
