import { describe, expect, it } from "vitest";

import { hazardReportsGeoJSON, type HazardReport } from "@/lib/open-areas";

const report: HazardReport = {
  id: "r1",
  kind: "sighting",
  sighting: "smoke",
  lat: 36.5,
  lon: 4.1,
  observed_at: "2026-09-02T10:00:00Z",
  created_at: "2026-09-02T10:05:00Z",
  status: "pending",
};

describe("hazardReportsGeoJSON", () => {
  it("maps each report to a point carrying id, kind and status", () => {
    const fc = hazardReportsGeoJSON([report]);
    expect(fc.features[0]!.geometry).toEqual({
      type: "Point",
      coordinates: [4.1, 36.5],
    });
    expect(fc.features[0]!.properties).toEqual({
      id: "r1",
      kind: "sighting",
      status: "pending",
    });
  });
});
