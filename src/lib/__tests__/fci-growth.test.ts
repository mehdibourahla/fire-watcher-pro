import { describe, expect, it } from "vitest";

import { fciGrowth, type Det } from "@/lib/ingest/fusion.server";

const now = Date.parse("2026-09-02T18:00:00Z");
const MIN = 60_000;

function slot(minutesAgo: number, pixels: number, sensor = "FCI"): Det[] {
  const at = new Date(now - minutesAgo * MIN).toISOString();
  return Array.from({ length: pixels }, (_, i) => ({
    id: `${at}-${i}`,
    source: "eumetsat",
    sensor,
    detected_at: at,
    lat: 36.5,
    lon: 4.05,
    confidence_raw: 0.8,
    frp_mw: 10,
    cluster_id: "c1",
  }));
}

describe("fciGrowth", () => {
  it("calls a fire growing when recent slots carry far more pixels", () => {
    const dets = [
      ...slot(50, 2),
      ...slot(40, 2),
      ...slot(20, 7),
      ...slot(10, 8),
    ];

    const growth = fciGrowth(dets, now);

    expect(growth?.trend).toBe("growing");
    expect(growth?.recent).toBeGreaterThan(growth!.earlier);
  });

  it("calls it fading when recent slots carry far fewer", () => {
    const dets = [
      ...slot(50, 9),
      ...slot(40, 8),
      ...slot(20, 2),
      ...slot(10, 2),
    ];

    expect(fciGrowth(dets, now)?.trend).toBe("fading");
  });

  it("calls a wobble steady rather than growing", () => {
    const dets = [
      ...slot(50, 4),
      ...slot(40, 5),
      ...slot(20, 5),
      ...slot(10, 4),
    ];

    expect(fciGrowth(dets, now)?.trend).toBe("steady");
  });

  // one pixel becoming two is a detection-threshold flicker, not a fire doubling
  it("does not call a one-pixel move growth", () => {
    const dets = [
      ...slot(50, 1),
      ...slot(40, 1),
      ...slot(20, 1),
      ...slot(10, 2),
    ];

    expect(fciGrowth(dets, now)?.trend).toBe("steady");
  });

  it("reports nothing when the newest look is too old to describe now", () => {
    const dets = [
      ...slot(600, 2),
      ...slot(580, 2),
      ...slot(560, 8),
      ...slot(540, 9),
    ];

    expect(fciGrowth(dets, now)).toBeNull();
  });

  it("reports nothing without enough slots to split into two halves", () => {
    expect(fciGrowth([...slot(20, 3), ...slot(10, 9)], now)).toBeNull();
    expect(fciGrowth([], now)).toBeNull();
  });

  it("ignores other sensors, whose pixels are a different size", () => {
    const dets = [
      ...slot(50, 2),
      ...slot(40, 2),
      ...slot(20, 2),
      ...slot(10, 2),
      ...slot(12, 30, "VIIRS"),
    ];

    expect(fciGrowth(dets, now)?.trend).toBe("steady");
  });

  it("carries the window it compared so the page can date the claim", () => {
    const dets = [
      ...slot(50, 2),
      ...slot(40, 2),
      ...slot(20, 7),
      ...slot(10, 8),
    ];

    const growth = fciGrowth(dets, now);

    expect(growth?.since).toBe(new Date(now - 50 * MIN).toISOString());
    expect(growth?.latestAt).toBe(new Date(now - 10 * MIN).toISOString());
  });
});
