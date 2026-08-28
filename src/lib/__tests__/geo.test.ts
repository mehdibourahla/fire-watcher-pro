import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isInAlgeriaNorth, isInWatchArea } from "@/lib/ingest/geo";

describe("cross-border watch area", () => {
  it("keeps a fire just inside Tunisia", () => {
    expect(isInWatchArea(36.4, 9.0)).toBe(true);
    expect(isInAlgeriaNorth(36.4, 9.0)).toBe(false);
  });

  it("keeps a fire just inside Morocco", () => {
    expect(isInWatchArea(34.5, -2.6)).toBe(true);
    expect(isInAlgeriaNorth(34.5, -2.6)).toBe(false);
  });

  it("drops a fire deep inside Tunisia", () => {
    expect(isInWatchArea(36.5, 10.4)).toBe(false);
  });

  it("keeps domestic fires", () => {
    expect(isInWatchArea(36.9, 7.77)).toBe(true);
    expect(isInAlgeriaNorth(36.9, 7.77)).toBe(true);
  });

  it("keeps El Kala, whose national park sits at the coastal edge", () => {
    expect(isInAlgeriaNorth(36.89, 8.44)).toBe(true);
  });

  it("still drops offshore anomalies", () => {
    expect(isInWatchArea(37.4, 4.0)).toBe(false);
  });

  it("still drops Saharan gas flares", () => {
    expect(isInWatchArea(31.5, 5.0)).toBe(false);
  });
});

describe("FIRMS fetch box", () => {
  it("covers every point the watch area accepts", () => {
    const src = readFileSync("src/lib/ingest/firms.server.ts", "utf8");
    const area = /const AREA = "([^"]+)"/.exec(src)?.[1] ?? "";
    const [west, south, east, north] = area.split(",").map(Number);

    const outside: string[] = [];
    for (let lat = 30; lat <= 39; lat += 0.25) {
      for (let lon = -6; lon <= 13; lon += 0.25) {
        if (!isInWatchArea(lat, lon)) continue;
        if (lon < west! || lon > east! || lat < south! || lat > north!)
          outside.push(`${lat},${lon}`);
      }
    }
    expect(outside).toEqual([]);
  });
});
