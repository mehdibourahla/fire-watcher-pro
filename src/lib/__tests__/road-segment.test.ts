import { describe, expect, it } from "vitest";
import { haversineKm } from "@/lib/nadhir";
import { cutSegment, type LonLat } from "@/lib/road-segment";

const length = (line: LonLat[]) =>
  line.slice(1).reduce((km, p, i) => {
    const q = line[i]!;
    return km + haversineKm(q[1], q[0], p[1], p[0]);
  }, 0);
const east = (lon: number): LonLat => [lon, 36];

describe("cutSegment", () => {
  const road: LonLat[] = [east(3.0), east(3.1), east(3.2)];

  it("cuts about 4 km centred on the point nearest the anchor", () => {
    const segment = cutSegment([road], [3.1, 36.01])!;
    expect(length(segment)).toBeCloseTo(4, 1);
    const middle = segment.reduce((sum, p) => sum + p[0], 0) / segment.length;
    expect(middle).toBeCloseTo(3.1, 2);
  });

  it("returns nothing when the road passes farther than 3 km away", () => {
    expect(cutSegment([road], [3.1, 36.05])).toBeNull();
  });

  it("joins pieces split at tile edges", () => {
    const segment = cutSegment(
      [
        [east(3.1), east(3.2)],
        [east(3.0), east(3.1)],
      ],
      [3.1, 36],
    )!;
    expect(length(segment)).toBeCloseTo(4, 1);
  });

  it("keeps the part that exists when the road ends", () => {
    const segment = cutSegment([[east(3.0), east(3.1)]], [3.1, 36])!;
    expect(length(segment)).toBeCloseTo(2, 1);
  });

  it("ends nearer the destination the post names", () => {
    const toWest = cutSegment([road], [3.1, 36], { toward: [2.5, 36] })!;
    expect(toWest[0]![0]).toBeGreaterThan(toWest[toWest.length - 1]![0]);
    const toEast = cutSegment([road], [3.1, 36], { toward: [3.9, 36] })!;
    expect(toEast[0]![0]).toBeLessThan(toEast[toEast.length - 1]![0]);
  });
});
