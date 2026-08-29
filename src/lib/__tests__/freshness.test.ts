import { describe, expect, it } from "vitest";

import { sourceStale } from "@/lib/freshness";

const NOW = new Date("2026-08-29T12:00:00Z").getTime();

const source = (over: Partial<Parameters<typeof sourceStale>[0]>) => ({
  name: "firms",
  status: "ok" as const,
  last_ok_at: "2026-08-29T11:30:00Z",
  ...over,
});

describe("sourceStale", () => {
  it("is fresh within the cadence window", () => {
    expect(sourceStale(source({}), NOW)).toBe(false);
  });

  it("flags a 10-minute source silent for over an hour", () => {
    expect(
      sourceStale(source({ last_ok_at: "2026-08-29T10:30:00Z" }), NOW),
    ).toBe(true);
  });

  it("flags an ok source that never ran", () => {
    expect(sourceStale(source({ last_ok_at: null }), NOW)).toBe(true);
  });

  it("does not flag the geo seed inside its monthly cadence", () => {
    expect(
      sourceStale(
        source({ name: "geo", last_ok_at: "2026-08-01T00:00:00Z" }),
        NOW,
      ),
    ).toBe(false);
    expect(
      sourceStale(
        source({ name: "geo", last_ok_at: "2026-06-01T00:00:00Z" }),
        NOW,
      ),
    ).toBe(true);
  });

  it("gives the daily FWI a 30-hour window", () => {
    expect(
      sourceStale(
        source({ name: "local_fwi", last_ok_at: "2026-08-28T06:10:00Z" }),
        NOW,
      ),
    ).toBe(false);
    expect(
      sourceStale(
        source({ name: "local_fwi", last_ok_at: "2026-08-27T06:10:00Z" }),
        NOW,
      ),
    ).toBe(true);
  });

  it("never flags unavailable or unknown sources", () => {
    expect(
      sourceStale(source({ status: "unavailable", last_ok_at: null }), NOW),
    ).toBe(false);
    expect(
      sourceStale(
        source({ name: "some_future_source", last_ok_at: null }),
        NOW,
      ),
    ).toBe(false);
  });
});
