import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn(async (rows: unknown[]) => ({
  error: null,
  count: rows.length,
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({ upsert })),
  },
}));

import { ingestFci } from "@/lib/ingest/fci.server";
import { ingestFirms } from "@/lib/ingest/firms.server";

const interval = {
  dataFrom: "2026-08-31T19:50:00.000Z",
  dataThrough: "2026-08-31T20:00:00.000Z",
};

describe("recorded source interval replay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T20:10:00.000Z"));
    process.env["FIRMS_MAP_KEY"] = "test-key";
    upsert.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env["FIRMS_MAP_KEY"];
  });

  it("filters FIRMS history to the recorded interval and reports full coverage", async () => {
    const csv = [
      "latitude,longitude,acq_date,acq_time,confidence,frp,daynight",
      "36.70000,3.10000,2026-08-31,1955,n,12.5,D",
      "36.71000,3.11000,2026-08-31,1940,n,11.0,D",
    ].join("\n");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(csv, { status: 200 })),
    );

    const result = await ingestFirms(interval);

    expect(result).toMatchObject({
      fetched: 4,
      inserted: 4,
      dataFrom: interval.dataFrom,
      dataThrough: interval.dataThrough,
    });
    expect(upsert.mock.calls.flatMap(([rows]) => rows)).toHaveLength(4);
  });

  it("bounds FCI replay at both ends and reports the requested coverage", async () => {
    const features = [
      {
        geometry: { coordinates: [3.1, 36.7] },
        properties: {
          FRP: 10,
          Confidence: 80,
          SZA: 50,
          Datetime: "2026-08-31 19:55:00",
          time: "2026-08-31T19:50:00Z",
        },
      },
      {
        geometry: { coordinates: [3.2, 36.8] },
        properties: {
          FRP: 11,
          Confidence: 81,
          SZA: 51,
          Datetime: "2026-08-31 20:05:00",
          time: "2026-08-31T20:00:00Z",
        },
      },
    ];
    const fetchMock = vi.fn(async (_input: string) =>
      Response.json({ type: "FeatureCollection", features }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await ingestFci(interval);

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("cql_filter")).toBe(
      "time >= '2026-08-31T19:50:00Z' AND time <= '2026-08-31T20:00:00Z' AND BBOX(geom, 18.9, -8.7, 37.6, 12)",
    );
    expect(result).toMatchObject({
      fetched: 1,
      inserted: 1,
      dataFrom: interval.dataFrom,
      dataThrough: interval.dataThrough,
    });
  });
});
