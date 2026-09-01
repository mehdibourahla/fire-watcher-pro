import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, dispatchWebhooks } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  dispatchWebhooks: vi.fn(async () => ({ sent: 0, failed: 0 })),
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: fromMock },
}));

vi.mock("@/lib/webhooks.server", () => ({ dispatchWebhooks }));

import { evaluateAlerts } from "@/lib/alerts-engine.server";

type Result = { data: unknown; error: { message: string } | null };

function query(table: string, result: Result, filters: [string, unknown][]) {
  let mode = "read";
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "order", "limit", "range", "in"]) {
    builder[method] = vi.fn((...args: unknown[]) => {
      if (method === "in") filters.push([String(args[0]), args[1]]);
      return builder;
    });
  }
  builder["eq"] = vi.fn((column: string, value: unknown) => {
    filters.push([column, value]);
    return builder;
  });
  builder["upsert"] = vi.fn(() => {
    mode = "upsert";
    return builder;
  });
  builder["maybeSingle"] = vi.fn(async () => result);
  builder["then"] = (resolve: (value: Result) => unknown) =>
    Promise.resolve(
      mode === "upsert" && table === "alerts"
        ? { data: [{ id: "alert-1" }], error: null }
        : result,
    ).then(resolve);
  return builder;
}

describe("alert risk publication boundary", () => {
  beforeEach(() => {
    fromMock.mockReset();
    dispatchWebhooks.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => vi.useRealTimers());

  it("uses the matching stale published horizon on the Algiers calendar", async () => {
    vi.setSystemTime(new Date("2026-09-03T23:30:00.000Z"));
    const filtersByTable = new Map<string, [string, unknown][]>();
    const data: Record<string, unknown> = {
      zones: [
        {
          id: "z1",
          user_id: "u1",
          commune_id: "c1",
          name: "Zone 1",
          active: true,
          notify_fires: false,
          notify_risk: true,
          min_danger_level: 3,
          lat: 36.7,
          lon: 3.1,
          radius_km: 10,
        },
      ],
      profiles: [
        {
          id: "u1",
          locale: "en",
          min_danger_level: 3,
          quiet_hours_start: null,
          quiet_hours_end: null,
        },
      ],
      fire_clusters: [],
      settlements: [],
      source_health: {
        coverage_status: "complete",
        valid_at: "2026-08-31T00:00:00.000Z",
        last_success_at: "2026-08-31T00:20:00.000Z",
        published_at: "2026-08-31T00:20:00.000Z",
      },
      risk_forecasts: [
        {
          commune_id: "c1",
          forecast_date: "2026-09-04",
          horizon_days: 4,
          danger_level: 4,
          fuel_limited: false,
          source: "local_fwi",
        },
      ],
      alerts: [],
    };
    fromMock.mockImplementation((table: string) => {
      const filters: [string, unknown][] = [];
      filtersByTable.set(table, filters);
      return query(table, { data: data[table] ?? [], error: null }, filters);
    });

    const result = await evaluateAlerts("u1");

    expect(result.created).toBe(1);
    expect(filtersByTable.get("source_health")).toContainEqual([
      "key",
      "local_fwi",
    ]);
    expect(filtersByTable.get("risk_forecasts")).toEqual(
      expect.arrayContaining([
        ["source", "local_fwi"],
        ["forecast_date", "2026-09-04"],
        ["horizon_days", 4],
      ]),
    );
  });
});
