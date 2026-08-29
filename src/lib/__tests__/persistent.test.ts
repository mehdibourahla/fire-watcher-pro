import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { nearestSource } from "@/lib/ingest/persistent.server";
import { cellCentre, cellKey, qualifies, siteIdFor } from "@/lib/persistent";

describe("grid", () => {
  it("keys a coordinate to its 0.01 degree cell and back to the centre", () => {
    expect(cellKey(31.6604, 6.0632)).toEqual([3166, 606]);
    expect(cellCentre([3166, 606])).toEqual({ lat: 31.66, lon: 6.06 });
  });

  it("keys negative longitudes without drifting a cell", () => {
    expect(cellKey(35.8112, -0.2629)).toEqual([3581, -26]);
    const c = cellCentre([3581, -26]);
    expect(c.lat).toBeCloseTo(35.81, 10);
    expect(c.lon).toBeCloseTo(-0.26, 10);
  });

  it("derives a stable site id from the cell key", () => {
    expect(siteIdFor([3166, 606])).toBe("dz-3166-606");
    expect(siteIdFor([3581, -26])).toBe("dz-3581--26");
  });
});

describe("registration criteria", () => {
  const base = { staticShare: 0.71, activeDays: 6, detectionCount: 12 };

  it("registers a cell meeting all three criteria", () => {
    expect(qualifies(base)).toBe(true);
  });

  it("rejects a cell below the static share floor", () => {
    expect(qualifies({ ...base, staticShare: 0.69 })).toBe(false);
  });

  it("rejects a persistent cell with too few detections to be stable", () => {
    expect(qualifies({ ...base, staticShare: 0.9, detectionCount: 8 })).toBe(
      false,
    );
  });

  it("rejects a cell seen on too few distinct days", () => {
    expect(qualifies({ ...base, activeDays: 4 })).toBe(false);
  });
});

describe("screen radius", () => {
  const sources = [{ lat: 35.81, lon: -0.26, site_id: "dz-3581--26" }];

  it("screens a detection inside the radius", () => {
    expect(nearestSource(35.815, -0.262, sources)?.site_id).toBe("dz-3581--26");
  });

  it("leaves a detection beyond the radius alone", () => {
    expect(nearestSource(35.83, -0.3, sources)).toBeNull();
  });

  it("returns null when the registry is empty", () => {
    expect(nearestSource(35.81, -0.26, [])).toBeNull();
  });
});

describe("fusion contract", () => {
  it("still filters clustering on fp_reason", () => {
    const src = readFileSync("src/lib/ingest/fusion.server.ts", "utf8");
    expect(src).toContain('.is("fp_reason", null)');
  });
});
