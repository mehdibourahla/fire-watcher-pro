import { describe, expect, it } from "vitest";

import {
  confidenceScore,
  distinctLooks,
  stateFor,
  type Det,
} from "@/lib/ingest/fusion.server";

const HOUR = 3600_000;
const now = Date.parse("2026-09-02T12:00:00Z");

const det = (over: Partial<Det> = {}): Det => ({
  id: "d1",
  source: "fci",
  sensor: "FCI",
  detected_at: "2026-09-02T11:38:00Z",
  lat: 36.7,
  lon: 5.8,
  confidence_raw: 0.9,
  frp_mw: 20,
  cluster_id: null,
  ...over,
});

describe("distinctLooks", () => {
  it("counts one look for two pixels of one sensor in one slot", () => {
    expect(
      distinctLooks([
        det({ id: "a", detected_at: "2026-09-02T11:38:26Z" }),
        det({ id: "b", detected_at: "2026-09-02T11:38:26Z" }),
      ]),
    ).toBe(1);
  });

  it("counts two looks across slots and across sensors", () => {
    expect(
      distinctLooks([
        det({ id: "a", detected_at: "2026-09-02T11:38:00Z" }),
        det({ id: "b", detected_at: "2026-09-02T11:48:00Z" }),
      ]),
    ).toBe(2);
    expect(
      distinctLooks([
        det({ id: "a", sensor: "FCI" }),
        det({ id: "b", sensor: "VIIRS_NOAA20" }),
      ]),
    ).toBe(2);
  });
});

describe("stateFor", () => {
  const fresh = Date.parse("2026-09-02T11:40:00Z");

  it("holds a single-slot pixel pair as a candidate", () => {
    const dets = [
      det({ id: "a", detected_at: "2026-09-02T11:38:26Z" }),
      det({ id: "b", detected_at: "2026-09-02T11:38:26Z" }),
    ];
    expect(stateFor(dets, fresh, now)).toBe("unconfirmed");
  });

  it("promotes on a second look, from another slot or another sensor", () => {
    expect(
      stateFor(
        [
          det({ id: "a", detected_at: "2026-09-02T11:28:00Z" }),
          det({ id: "b", detected_at: "2026-09-02T11:38:00Z" }),
        ],
        fresh,
        now,
      ),
    ).toBe("active");
    expect(
      stateFor(
        [det({ id: "a" }), det({ id: "b", sensor: "VIIRS_NOAA21" })],
        fresh,
        now,
      ),
    ).toBe("active");
  });

  it("ages a fire out of the live set on time, whatever its evidence", () => {
    const dets = [
      det({ id: "a", detected_at: "2026-09-02T04:00:00Z" }),
      det({ id: "b", detected_at: "2026-09-02T04:10:00Z" }),
    ];
    expect(stateFor(dets, now - 7 * HOUR, now)).toBe("contained_guess");
    expect(stateFor(dets, now - 25 * HOUR, now)).toBe("extinguished");
  });
});

describe("confidenceScore", () => {
  it("rises with sensor agreement and stays under one", () => {
    const one = confidenceScore([det()]);
    const two = confidenceScore([
      det({ id: "a" }),
      det({
        id: "b",
        sensor: "VIIRS_NOAA20",
        detected_at: "2026-09-02T11:48:00Z",
      }),
    ]);
    expect(two).toBeGreaterThan(one);
    expect(two).toBeLessThanOrEqual(0.99);
  });
});
