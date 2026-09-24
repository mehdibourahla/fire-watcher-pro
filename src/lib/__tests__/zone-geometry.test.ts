import { describe, expect, it } from "vitest";

import { haversineKm } from "@/lib/nadhir";
import { radiusCircle } from "@/lib/zone-geometry";

describe("radiusCircle", () => {
  it.each([
    [36.75, 3.06, 10],
    [36.75, 3.06, 60],
    [22.79, 5.52, 2],
  ])("puts every vertex %s,%s at %s km from the centre", (lat, lon, km) => {
    const ring = radiusCircle(lat, lon, km).coordinates[0]!;
    for (const [x, y] of ring)
      expect(haversineKm(lat, lon, y!, x!)).toBeCloseTo(km, 1);
  });

  it("closes the ring so MapLibre fills it", () => {
    const ring = radiusCircle(36.75, 3.06, 10).coordinates[0]!;
    expect(ring.at(-1)).toEqual(ring[0]);
  });
});
