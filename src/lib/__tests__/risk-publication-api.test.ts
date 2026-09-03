import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/public-api.server", () => ({
  publicSupabase: () => ({ from: fromMock, rpc: rpcMock }),
  json: (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
    }),
  clampInt: (
    value: string | null,
    fallback: number,
    min: number,
    max: number,
  ) => {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed)
      ? Math.min(Math.max(parsed, min), max)
      : fallback;
  },
  enforceRateLimit: async () => null,
  methodNotAllowed: vi.fn(),
  preflight: vi.fn(),
}));

import { Route } from "@/routes/api/public/v1/risk";

type Result = { data: unknown; error: { message: string } | null };

function query(result: Result, filters: [string, unknown][] = []) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "order", "limit", "range"]) {
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

async function get(url = "https://nadhir.test/api/public/v1/risk") {
  const handlers = Route.options.server?.handlers as unknown as {
    GET: (input: { request: Request }) => Promise<Response>;
  };
  const handler = handlers.GET;
  return handler({ request: new Request(url) });
}

describe("public risk publication boundary", () => {
  beforeEach(() => {
    fromMock.mockReset();
    rpcMock.mockReset();
  });

  it.each([
    ["missing", null, null],
    [
      "partial",
      {
        coverage_status: "partial",
        snapshot_id: "f0220000-0000-4000-8000-000000000009",
        base_date: "2026-08-31",
        published_at: "2026-08-31T00:20:00.000Z",
      },
      null,
    ],
    ["errored", null, { message: "checkpoint secret diagnostic" }],
  ])(
    "returns a stable generic 503 without reading forecasts for a %s checkpoint",
    async (_label, checkpoint, checkpointError) => {
      let riskReads = 0;
      fromMock.mockImplementation((table: string) => {
        if (table === "risk_publication_checkpoint")
          return query({ data: checkpoint, error: checkpointError });
        return query({ data: [], error: null });
      });
      rpcMock.mockImplementation(() => {
        riskReads += 1;
        return query({ data: [{ id: "must-not-leak" }], error: null });
      });

      const response = await get();

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: "forecast unavailable",
      });
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(riskReads).toBe(0);
    },
  );

  it("uses the complete checkpoint base for the requested horizon", async () => {
    const forecastFilters: [string, unknown][] = [];
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
      return query({ data: [], error: null });
    });
    rpcMock.mockReturnValue(
      query(
        {
          data: [
            {
              forecast_date: "2026-09-03",
              horizon_days: 3,
              fwi: 25,
              danger_level: 3,
              fuel_limited: false,
              source: "local_fwi",
              commune_code: "1601",
              name_en: "Algiers",
              name_ar: "الجزائر",
              name_fr: "Alger",
              admin_level: "commune",
            },
          ],
          error: null,
        },
        forecastFilters,
      ),
    );

    const response = await get(
      "https://nadhir.test/api/public/v1/risk?horizon=3",
    );

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("current_risk_forecasts");
    expect(forecastFilters).toContainEqual(["source", "local_fwi"]);
    expect(forecastFilters).toContainEqual([
      "snapshot_id",
      "f0220000-0000-4000-8000-000000000001",
    ]);
    expect(forecastFilters).toContainEqual(["forecast_date", "2026-09-03"]);
    expect(forecastFilters).toContainEqual(["horizon_days", 3]);
    await expect(response.json()).resolves.toMatchObject({
      count: 1,
      forecasts: [
        {
          forecast_date: "2026-09-03",
          horizon_days: 3,
          fwi: 25,
          danger_level: 3,
          fuel_limited: false,
          source: "local_fwi",
          admin_units: {
            code: "1601",
            name_en: "Algiers",
            name_ar: "الجزائر",
            name_fr: "Alger",
            level: "commune",
          },
        },
      ],
    });
  });

  it("carries the local percentile when the forecast has one", async () => {
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
      return query({ data: [], error: null });
    });
    rpcMock.mockReturnValue(
      query({
        data: [
          {
            forecast_date: "2026-08-31",
            horizon_days: 0,
            fwi: 55,
            fwi_percentile: 91,
            danger_level: 5,
            fuel_limited: false,
            source: "local_fwi",
            commune_code: "3210",
            name_en: "El Bayadh",
            name_ar: "البيض",
            name_fr: "El Bayadh",
            admin_level: "commune",
          },
        ],
        error: null,
      }),
    );

    const response = await get("https://nadhir.test/api/public/v1/risk");

    await expect(response.json()).resolves.toMatchObject({
      forecasts: [{ fwi: 55, fwi_percentile: 91 }],
    });
  });

  it("does not expose database diagnostics when the published forecast read fails", async () => {
    fromMock.mockImplementation((table: string) =>
      table === "risk_publication_checkpoint"
        ? query({
            data: {
              coverage_status: "complete",
              snapshot_id: "f0220000-0000-4000-8000-000000000001",
              base_date: "2026-08-31",
              published_at: "2026-08-31T00:20:00.000Z",
            },
            error: null,
          })
        : query({ data: [], error: null }),
    );
    rpcMock.mockReturnValue(
      query({
        data: null,
        error: { message: "relation secret_table does not exist" },
      }),
    );

    const response = await get();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "forecast unavailable",
    });
  });
});
