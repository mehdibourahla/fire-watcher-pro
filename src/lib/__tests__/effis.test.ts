import { describe, expect, it } from "vitest";

import {
  EFFIS_BBOX,
  EFFIS_CLASSES,
  EFFIS_HEIGHT,
  EFFIS_WIDTH,
  classifyPixel,
  isColdStart,
  parseFeatureInfoDc,
  pixelFor,
} from "@/lib/ingest/effis.server";

describe("EFFIS palette", () => {
  it("maps every legend color to its class and nothing else", () => {
    expect(classifyPixel(145, 252, 170)).toBe("low");
    expect(classifyPixel(210, 225, 74)).toBe("moderate");
    expect(classifyPixel(241, 179, 0)).toBe("high");
    expect(classifyPixel(231, 117, 0)).toBe("very_high");
    expect(classifyPixel(192, 0, 12)).toBe("extreme");
    expect(classifyPixel(58, 0, 21)).toBe("very_extreme");
    expect(classifyPixel(146, 252, 170)).toBeNull();
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

describe("cold-start guard", () => {
  const html = `<H2>Fire Danger</H2>
<table id="main">
<tr><td>Fire Weather Index (FWI)</td><td>0.65873992</td></tr>
<tr><td>Duff Moisture Code (DMC)</td><td>6.5276856</td></tr>
<tr><td>Drought Code (DC)</td><td>17.270311</td></tr>
<tr><td>Initial Spread Index (ISI)</td><td>1.3386426</td></tr>
</table>`;

  it("reads the DC value out of a GetFeatureInfo html table", () => {
    expect(parseFeatureInfoDc(html)).toBeCloseTo(17.270311);
  });

  it("returns null for a body with no DC row", () => {
    expect(parseFeatureInfoDc("")).toBeNull();
    expect(parseFeatureInfoDc("<html>error</html>")).toBeNull();
  });

  it("flags a summer run whose sentinels all sit at initialization DC", () => {
    expect(isColdStart([17.3, 17.5, 16.4], 8)).toBe(true);
  });

  it("accepts a summer run when any sentinel carries real drought", () => {
    expect(isColdStart([17.3, 512.8, 16.4], 8)).toBe(false);
  });

  it("never flags outside the dry season, when low DC is legitimate", () => {
    expect(isColdStart([17.3, 17.5, 16.4], 1)).toBe(false);
  });

  it("is inconclusive with no readable sentinel", () => {
    expect(isColdStart([], 8)).toBe(false);
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
