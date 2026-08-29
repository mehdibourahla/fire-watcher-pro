import { describe, expect, it } from "vitest";

import { estimateAreaHa, nearestFrom } from "@/lib/ingest/fusion-geometry";

const det = (lat: number, lon: number, frp: number | null = 5) => ({
  lat,
  lon,
  frp_mw: frp,
});

describe("nearestFrom", () => {
  // a fire reaches a village from its front, so proximity is measured to the
  // nearest detection, never to the centre of mass
  it("measures from the closest detection, not the centroid", () => {
    const fire = [det(36.0, 6.0), det(36.1, 6.0), det(36.2, 6.0)];
    const village = { id: "v", lat: 36.21, lon: 6.0 };
    const hit = nearestFrom(fire, [village], 15);
    expect(hit!.km).toBeLessThan(2);
  });

  it("never reports a greater distance than the centroid would", () => {
    const fire = [det(36.0, 6.0), det(36.3, 6.0)];
    const village = { id: "v", lat: 36.31, lon: 6.0 };
    const edge = nearestFrom(fire, [village], 60)!.km;
    expect(edge).toBeLessThan(17);
  });

  it("returns null when every candidate is beyond the cap", () => {
    expect(
      nearestFrom([det(36, 6)], [{ id: "v", lat: 40, lon: 6 }], 15),
    ).toBeNull();
  });
});

describe("estimateAreaHa", () => {
  it("counts a repeatedly observed pixel once", () => {
    const onePixelSixPasses = Array.from({ length: 6 }, () =>
      det(36.0, 6.0, 40),
    );
    expect(estimateAreaHa(onePixelSixPasses)).toBe(14);
  });

  it("scales with distinct pixels, not with detection count", () => {
    const three = [det(36.0, 6.0), det(36.01, 6.0), det(36.02, 6.0)];
    expect(estimateAreaHa(three)).toBe(42);
  });

  it("does not inflate with radiative power", () => {
    const hot = [det(36.0, 6.0, 5000), det(36.0, 6.0, 5000)];
    expect(estimateAreaHa(hot)).toBe(14);
  });
});
