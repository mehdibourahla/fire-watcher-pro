import { describe, expect, it } from "vitest";

import {
  EFFIS_BBOX,
  EFFIS_CLASSES,
  EFFIS_HEIGHT,
  EFFIS_WIDTH,
  classifyPixel,
  effisMapUrl,
  isColdStartDistribution,
  pixelFor,
  pngPayloadError,
} from "@/lib/ingest/effis.server";

describe("EFFIS palette", () => {
  it("maps every legend color to its class and nothing else", () => {
    expect(classifyPixel(156, 255, 192)).toBe("low");
    expect(classifyPixel(205, 226, 78)).toBe("moderate");
    expect(classifyPixel(230, 172, 0)).toBe("high");
    expect(classifyPixel(217, 112, 16)).toBe("very_high");
    expect(classifyPixel(173, 6, 14)).toBe("extreme");
    expect(classifyPixel(58, 0, 21)).toBe("very_extreme");
    expect(classifyPixel(157, 255, 192)).toBeNull();

    // the retired ECMWF palette must stop matching, or a stale layer would
    // classify as though nothing had changed
    expect(classifyPixel(145, 252, 170)).toBeNull();
    expect(classifyPixel(192, 0, 12)).toBeNull();
  });

  it("classifies EFFIS's white no-rating mask as masked, not as absent", () => {
    expect(classifyPixel(255, 255, 255)).toBe("masked");
  });

  it("orders classes from lowest to highest danger", () => {
    expect(EFFIS_CLASSES.map((c) => c.key)).toEqual([
      "low",
      "moderate",
      "high",
      "very_high",
      "extreme",
      "very_extreme",
    ]);
  });
});

describe("effisMapUrl", () => {
  it("asks the layer for one exact day", () => {
    const url = effisMapUrl("2026-09-03");

    expect(url).toContain("maps.effis.emergency.copernicus.eu");
    expect(url).toContain("layers=mf010.fwi");
    expect(url).toContain("TIME=2026-09-03");
  });

  // MapServer 8 rejects GetMap without STYLES, and an absent TIME silently
  // serves the layer default of 2021-01-01 rather than today
  it("sends STYLES, which the new server requires", () => {
    expect(effisMapUrl("2026-09-03")).toContain("STYLES=");
  });

  it("dates each day separately so a replayed gap fetches its own day", () => {
    expect(effisMapUrl("2026-09-01")).not.toEqual(effisMapUrl("2026-09-02"));
  });
});

describe("cold-start guard", () => {
  const many = (cls: "low" | "extreme", n: number) =>
    Array.from({ length: n }, () => cls);

  it("flags a dry-season run rated low nearly everywhere", () => {
    expect(isColdStartDistribution(many("low", 100), 8)).toBe(true);
  });

  it("accepts a real dry-season day, where low is a small minority", () => {
    expect(
      isColdStartDistribution([...many("low", 3), ...many("extreme", 97)], 8),
    ).toBe(false);
  });

  it("never flags outside the dry season, when low everywhere is legitimate", () => {
    expect(isColdStartDistribution(many("low", 100), 1)).toBe(false);
  });

  it("ignores the mask, which is not a danger rating", () => {
    const masked = Array.from({ length: 500 }, () => "masked" as const);
    expect(
      isColdStartDistribution([...masked, ...many("extreme", 100)], 8),
    ).toBe(false);
  });

  it("is inconclusive when almost nothing carries a rating", () => {
    expect(isColdStartDistribution(many("low", 1), 8)).toBe(false);
    expect(isColdStartDistribution([], 8)).toBe(false);
  });
});

describe("pngPayloadError", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it("accepts a body carrying the PNG signature", () => {
    expect(pngPayloadError("image/png", png)).toBeNull();
  });

  // JRC serves mapserver failures as 200 text/html, so res.ok is not a contract
  it("rejects the MapServer error page JRC returns with HTTP 200", () => {
    const html = new TextEncoder().encode("<HTML>\n<HEAD><TITLE>MapServer");
    const error = pngPayloadError("text/html; charset=UTF-8", html);
    expect(error).toContain("text/html");
    expect(error).toContain("upstream");
  });

  it("rejects a body too short to carry a signature", () => {
    expect(pngPayloadError("image/png", new Uint8Array([0x89]))).not.toBeNull();
  });

  it("names the failure even when no content type is given", () => {
    expect(pngPayloadError(null, new Uint8Array())).toContain("upstream");
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

  it("covers the deep-Sahara communes the calibration question is about", () => {
    expect(pixelFor(27.87, -0.29)).not.toBeNull();
    expect(pixelFor(19.57, 5.77)).not.toBeNull();
  });

  it("returns null outside Algeria's bounds", () => {
    expect(pixelFor(15.0, 4.0)).toBeNull();
    expect(pixelFor(36.5, 20.0)).toBeNull();
  });
});
