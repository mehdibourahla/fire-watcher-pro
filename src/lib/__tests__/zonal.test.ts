import { describe, expect, it } from "vitest";

import {
  assembleRings,
  buildMultiPolygon,
  landcoverFractions,
  pointInMultiPolygon,
  sampleGrid,
  slopeStats,
  type Ring,
} from "@/lib/zonal";

const square: Ring = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
  [0, 0],
];
const hole: Ring = [
  [1, 1],
  [3, 1],
  [3, 3],
  [1, 3],
  [1, 1],
];

describe("assembleRings", () => {
  it("joins split ways into one closed ring, reversing where needed", () => {
    const rings = assembleRings([
      [
        [0, 0],
        [4, 0],
        [4, 4],
      ],
      [
        [0, 4],
        [4, 4],
      ],
      [
        [0, 4],
        [0, 0],
      ],
    ]);
    expect(rings).toHaveLength(1);
    expect(rings[0]![0]).toEqual(rings[0]![rings[0]!.length - 1]);
    expect(rings[0]!.length).toBe(5);
  });

  it("keeps an already-closed way as its own ring", () => {
    expect(assembleRings([square])).toEqual([square]);
  });

  it("drops segments that never close", () => {
    expect(
      assembleRings([
        [
          [0, 0],
          [1, 0],
        ],
      ]),
    ).toEqual([]);
  });
});

describe("pointInMultiPolygon", () => {
  const mp = buildMultiPolygon([square], [hole]);

  it("assigns the hole to its containing outer", () => {
    expect(mp).toEqual([[square, hole]]);
  });

  it("is true inside the outer, false in the hole, false outside", () => {
    expect(pointInMultiPolygon([0.5, 0.5], mp)).toBe(true);
    expect(pointInMultiPolygon([2, 2], mp)).toBe(false);
    expect(pointInMultiPolygon([5, 2], mp)).toBe(false);
  });
});

describe("sampleGrid", () => {
  it("returns only points inside the polygon, capped", () => {
    const mp = buildMultiPolygon([square], []);
    const pts = sampleGrid(mp, 100);
    expect(pts.length).toBeGreaterThan(50);
    expect(pts.length).toBeLessThanOrEqual(100);
    for (const p of pts) expect(pointInMultiPolygon(p, mp)).toBe(true);
  });
});

describe("landcoverFractions", () => {
  it("computes class fractions excluding nodata", () => {
    const f = landcoverFractions([10, 10, 20, 30, 60, 80, 95, 0])!;
    expect(f.tree).toBeCloseTo(2 / 7);
    expect(f.shrub).toBeCloseTo(1 / 7);
    expect(f.grass).toBeCloseTo(1 / 7);
    expect(f.bare).toBeCloseTo(1 / 7);
    expect(f.water).toBeCloseTo(1 / 7);
    expect(f.other).toBeCloseTo(1 / 7);
    expect(f.crop).toBe(0);
    expect(f.built).toBe(0);
  });

  it("returns null when every sample is nodata", () => {
    expect(landcoverFractions([0, 0])).toBeNull();
  });
});

describe("slopeStats", () => {
  const grid = (fn: (r: number, c: number) => number) =>
    Array.from({ length: 9 }, (_, r) =>
      Array.from({ length: 9 }, (_, c) => fn(r, c)),
    );

  it("reports zero slope on flat terrain", () => {
    const s = slopeStats(
      grid(() => 100),
      30,
      30,
    )!;
    expect(s.mean_slope_deg).toBeCloseTo(0);
    expect(s.pct_above_20_deg).toBe(0);
    expect(s.south_facing_pct).toBe(0);
  });

  it("recovers slope and south aspect on a plane rising north", () => {
    const rise = Math.tan((25 * Math.PI) / 180) * 30;
    const s = slopeStats(
      grid((r) => (8 - r) * rise),
      30,
      30,
    )!;
    expect(s.mean_slope_deg).toBeCloseTo(25, 1);
    expect(s.p90_slope_deg).toBeCloseTo(25, 1);
    expect(s.pct_above_20_deg).toBeCloseTo(100);
    expect(s.south_facing_pct).toBeCloseTo(100);
  });

  it("does not call an east-facing plane south-facing", () => {
    const rise = Math.tan((25 * Math.PI) / 180) * 30;
    const s = slopeStats(
      grid((_r, c) => c * rise),
      30,
      30,
    )!;
    expect(s.south_facing_pct).toBeCloseTo(0);
  });

  it("returns null for a grid too small to differentiate", () => {
    expect(slopeStats([[1, 2]], 30, 30)).toBeNull();
  });

  it("counts only masked-in cells", () => {
    const rise = Math.tan((25 * Math.PI) / 180) * 30;
    const elev = grid((r, c) => (c <= 4 ? (8 - r) * rise : 0));
    const mask = grid((r, c) => (r >= 1 && r <= 7 && c >= 1 && c <= 3 ? 1 : 0));
    const s = slopeStats(
      elev,
      30,
      30,
      mask.map((row) => row.map(Boolean)),
    )!;
    expect(s.mean_slope_deg).toBeCloseTo(25, 1);
    expect(s.south_facing_pct).toBeCloseTo(100);
    expect(s.cells).toBe(21);
  });
});
