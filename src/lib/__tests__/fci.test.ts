import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseFciFeatures } from "@/lib/ingest/fci.server";

const sample = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "fci-wfs-sample.json"), "utf8"),
) as Parameters<typeof parseFciFeatures>[0];

describe("parseFciFeatures", () => {
  it("maps a live WFS response onto detection rows", () => {
    const { rows, outside, latestSlot } = parseFciFeatures(sample);
    expect(outside).toBe(0);
    expect(latestSlot).toBe("2026-08-30T16:40:00Z");
    expect(rows).toHaveLength(4);
    const r = rows[0]!;
    expect(r.source).toBe("fci");
    expect(r.sensor).toBe("FCI");
    expect(r.lat).toBeCloseTo(28.0891);
    expect(r.lon).toBeCloseTo(9.7879);
    expect(r.frp_mw).toBeCloseTo(8.87);
    expect(r.confidence_raw).toBeCloseTo(0.88);
    expect(r.detected_at).toBe("2026-08-30T16:47:43.000Z");
    expect(r.daynight).toBe("D");
    expect(r.natural_key).toBe("fci:FCI:28.08910:9.78790:2026-08-30T16:40:00Z");
  });

  it("falls back to the slot time when the pixel Datetime is unparsable", () => {
    const broken = structuredClone(sample);
    broken.features[0]!.properties.Datetime = "garbage";
    const { rows } = parseFciFeatures(broken);
    expect(rows[0]!.detected_at).toBe("2026-08-30T16:40:00.000Z");
  });

  it("counts features outside the watch box instead of ingesting them", () => {
    const shifted = structuredClone(sample);
    shifted.features[1]!.geometry.coordinates = [30.0, 10.0];
    const { rows, outside } = parseFciFeatures(shifted);
    expect(rows).toHaveLength(3);
    expect(outside).toBe(1);
  });

  it("marks night detections from the solar zenith angle", () => {
    const night = structuredClone(sample);
    night.features[0]!.properties.SZA = 112.4;
    const { rows } = parseFciFeatures(night);
    expect(rows[0]!.daynight).toBe("N");
  });
});
