import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ results: [] as unknown[], fetch: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => {
      const q: Record<string, unknown> = {
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(mocks.results.shift()).then(resolve),
      };
      for (const key of [
        "select",
        "in",
        "gte",
        "order",
        "limit",
        "is",
        "not",
        "update",
        "eq",
      ])
        q[key] = () => q;
      return q;
    },
  },
}));
vi.mock("@/lib/source-archive.server", () => ({
  ArchiveFailure: class extends Error {},
  archivedFetch: (...args: unknown[]) => mocks.fetch(...args),
}));
import { enrichClusterWinds } from "../ingest/weather.server";
import { backfillCapDetails } from "../ingest/onm.server";
beforeEach(() => {
  mocks.results = [];
  mocks.fetch.mockReset();
});
describe("source persistence failures", () => {
  it("wind query errors cannot mean no active clusters", async () => {
    mocks.results.push({
      data: null,
      error: { message: "database unavailable" },
    });
    await expect(enrichClusterWinds()).rejects.toThrow("database unavailable");
  });
  it("wind write errors cannot count as updated clusters", async () => {
    mocks.results.push(
      { data: [{ id: "cluster", lat: 36.7, lon: 3.1 }], error: null },
      { data: null, error: { message: "write unavailable" } },
    );
    mocks.fetch.mockResolvedValue(
      Response.json({
        current: { wind_speed_10m: 10, wind_direction_10m: 90 },
      }),
    );
    await expect(enrichClusterWinds()).rejects.toThrow("write unavailable");
  });
  it("missing wind observations cannot pass as complete", async () => {
    mocks.results.push({
      data: [{ id: "cluster", lat: 36.7, lon: 3.1 }],
      error: null,
    });
    mocks.fetch.mockResolvedValue(Response.json({ current: {} }));
    await expect(enrichClusterWinds()).rejects.toThrow(/coverage/i);
  });
  it("CAP detail query failures surface", async () => {
    mocks.results.push({
      data: null,
      error: { message: "database unavailable" },
    });
    await expect(backfillCapDetails()).rejects.toThrow("database unavailable");
  });
  it("CAP detail write failures remain incomplete", async () => {
    mocks.results.push(
      {
        data: [
          {
            id: "cap",
            cap_url: "https://ametvigilance.meteo.dz/CAPs/test.xml",
          },
        ],
        error: null,
      },
      { error: { message: "write unavailable" } },
    );
    mocks.fetch.mockResolvedValue(
      new Response(
        readFileSync(
          new URL("./fixtures/onm-cap-sample.xml", import.meta.url),
          "utf8",
        ),
      ),
    );
    expect(await backfillCapDetails()).toMatchObject({ failed: 1, filled: 0 });
  });
});
