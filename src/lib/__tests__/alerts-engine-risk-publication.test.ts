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
  builder["upsert"] = vi.fn((_rows: unknown) => {
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

  it.each(["en", "fr", "ar", "kab"])(
    "emits honest lifecycle copy in %s and respects quiet hours",
    async (locale) => {
      vi.setSystemTime(new Date("2026-09-08T12:00:00Z"));
      const baseline = {
        id: "a",
        user_id: "u1",
        zone_id: "z1",
        cluster_id: "c1",
        created_at: "2026-09-08T10:00:00Z",
        payload: {
          est_area_ha: 10,
          max_frp_mw: 20,
          last_detected_at: "2026-09-08T10:00:00Z",
        },
      };
      const profile = {
        id: "u1",
        locale,
        quiet_hours_start: null as number | null,
        quiet_hours_end: null as number | null,
      };
      const cluster = {
        id: "c1",
        short_id: "abc",
        state: "active",
        lat: 36,
        lon: 3,
        confidence: 0.9,
        spread_bearing_deg: null,
        confirmed_at: null,
        est_area_ha: 20,
        max_frp_mw: 40,
        last_detected_at: "2026-09-08T11:50:00Z",
      };
      const data: Record<string, unknown> = {
        zones: [
          {
            id: "z1",
            user_id: "u1",
            name: "Zone",
            notify_fires: true,
            notify_risk: false,
            lat: 36,
            lon: 3,
            radius_km: 10,
          },
        ],
        profiles: [profile],
        fire_clusters: [cluster],
        alerts: [baseline],
        cluster_events: [
          {
            id: "e",
            cluster_id: "c1",
            event: "state:contained_guess",
            at: "2026-09-08T11:55:00Z",
            payload: { from: "active", detections: 2 },
          },
        ],
      };
      const writes: Record<string, unknown>[][] = [];
      fromMock.mockImplementation((table: string) => {
        const builder = query(
          table,
          { data: data[table] ?? [], error: null },
          [],
        );
        const upsert = builder["upsert"] as (rows: unknown) => unknown;
        builder["upsert"] = (rows: Record<string, unknown>[]) => {
          if (table === "alerts") writes.push(rows);
          return upsert(rows);
        };
        return builder;
      });
      await evaluateAlerts("u1");
      expect(
        writes
          .flat()
          .some((r) => (r["payload"] as { phase: string }).phase === "growth"),
      ).toBe(true);
      writes.length = 0;
      cluster.state = "contained_guess";
      await evaluateAlerts("u1");
      const row = writes.flat()[0]!;
      expect(row["severity"]).toBe(1);
      expect(row["body"]).toContain(cluster.last_detected_at);
      expect((row["payload"] as { phase: string }).phase).toBe(
        "observation_ended",
      );
      expect(row["cap_alert_id"]).toBeNull();
      writes.length = 0;
      profile.quiet_hours_start = 12;
      profile.quiet_hours_end = 14;
      await evaluateAlerts("u1");
      expect(writes).toEqual([]);
      cluster.state = "active";
      await evaluateAlerts("u1");
      expect(writes).toEqual([]);
      profile.quiet_hours_start = null;
      profile.quiet_hours_end = null;
      cluster.confidence = 0.1;
      await evaluateAlerts("u1");
      expect(writes).toEqual([]);
      cluster.confidence = 0.9;
      cluster.lat = 30;
      await evaluateAlerts("u1");
      expect(writes).toEqual([]);
    },
  );

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
      risk_publication_checkpoint: {
        coverage_status: "complete",
        snapshot_id: "f0220000-0000-4000-8000-000000000001",
        base_date: "2026-08-31",
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
    expect(filtersByTable.get("risk_publication_checkpoint")).toContainEqual([
      "key",
      "local_fwi",
    ]);
    expect(filtersByTable.get("risk_forecasts")).toEqual(
      expect.arrayContaining([
        ["source", "local_fwi"],
        ["snapshot_id", "f0220000-0000-4000-8000-000000000001"],
        ["forecast_date", "2026-09-04"],
        ["horizon_days", 4],
      ]),
    );
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
    ["errored", null, { message: "checkpoint unavailable" }],
  ])(
    "creates no risk alert and skips forecast reads for a %s checkpoint",
    async (_label, checkpoint, checkpointError) => {
      vi.setSystemTime(new Date("2026-09-03T23:30:00.000Z"));
      const tables: string[] = [];
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
        profiles: [{ id: "u1", locale: "en", min_danger_level: 3 }],
        fire_clusters: [],
        settlements: [],
        alerts: [],
      };
      fromMock.mockImplementation((table: string) => {
        tables.push(table);
        const result =
          table === "risk_publication_checkpoint"
            ? { data: checkpoint, error: checkpointError }
            : { data: data[table] ?? [], error: null };
        return query(table, result, []);
      });

      const result = await evaluateAlerts("u1");

      expect(result.created).toBe(0);
      expect(tables).not.toContain("risk_forecasts");
      expect(dispatchWebhooks).not.toHaveBeenCalled();
    },
  );

  it("creates no risk alert when the published forecast read fails", async () => {
    vi.setSystemTime(new Date("2026-09-03T23:30:00.000Z"));
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
      profiles: [{ id: "u1", locale: "en", min_danger_level: 3 }],
      fire_clusters: [],
      settlements: [],
      risk_publication_checkpoint: {
        coverage_status: "complete",
        snapshot_id: "f0220000-0000-4000-8000-000000000001",
        base_date: "2026-08-31",
        published_at: "2026-08-31T00:20:00.000Z",
      },
      alerts: [],
    };
    fromMock.mockImplementation((table: string) => {
      const result =
        table === "risk_forecasts"
          ? {
              data: [{ commune_id: "c1", danger_level: 5 }],
              error: { message: "forecast failed" },
            }
          : { data: data[table] ?? [], error: null };
      return query(table, result, []);
    });

    const result = await evaluateAlerts("u1");

    expect(result.created).toBe(0);
    expect(dispatchWebhooks).not.toHaveBeenCalled();
  });
});
