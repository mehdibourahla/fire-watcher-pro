import { describe, expect, it } from "vitest";

import {
  EFFIS_BBOX,
  EFFIS_CLASSES,
  EFFIS_HEIGHT,
  EFFIS_WIDTH,
  classifyPixel,
  pixelFor,
} from "@/lib/ingest/effis.server";

describe("EFFIS palette", () => {
  it("maps every legend color to its class and nothing else", () => {
    expect(classifyPixel(145, 252, 170)).toBe("very_low");
    expect(classifyPixel(210, 225, 74)).toBe("low");
    expect(classifyPixel(241, 179, 0)).toBe("moderate");
    expect(classifyPixel(231, 117, 0)).toBe("high");
    expect(classifyPixel(192, 0, 12)).toBe("very_high");
    expect(classifyPixel(58, 0, 21)).toBe("extreme");
    expect(classifyPixel(255, 255, 255)).toBeNull();
    expect(classifyPixel(146, 252, 170)).toBeNull();
  });

  it("orders classes from lowest to highest danger", () => {
    expect(EFFIS_CLASSES.map((c) => c.key)).toEqual([
      "very_low",
      "low",
      "moderate",
      "high",
      "very_high",
      "extreme",
    ]);
  });
});

describe("pixelFor", () => {
  it("maps the watch-area corners onto the image", () => {
    expect(pixelFor(EFFIS_BBOX.north, EFFIS_BBOX.west)).toEqual({ x: 0, y: 0 });
    expect(pixelFor(EFFIS_BBOX.south, EFFIS_BBOX.east)).toEqual({
      x: EFFIS_WIDTH - 1,
      y: EFFIS_HEIGHT - 1,
    });
  });

  it("places Tizi Ouzou inside the frame", () => {
    const p = pixelFor(36.52, 4.05);
    expect(p).not.toBeNull();
    expect(p!.x).toBeGreaterThan(0);
    expect(p!.x).toBeLessThan(EFFIS_WIDTH - 1);
    expect(p!.y).toBeGreaterThan(0);
    expect(p!.y).toBeLessThan(EFFIS_HEIGHT - 1);
  });

  it("returns null outside the watch area", () => {
    expect(pixelFor(20.0, 4.0)).toBeNull();
    expect(pixelFor(36.5, 20.0)).toBeNull();
  });
});
