import { describe, expect, it } from "vitest";

import { fireFeatureCollection, summariseFires } from "@/lib/public-api.server";

const fire = {
  short_id: "NDH-7Q2",
  state: "active",
  lat: 36.75,
  lon: 4.05,
  confidence: 0.82,
  detection_count: 6,
};

describe("fireFeatureCollection", () => {
  it("puts longitude before latitude, as GeoJSON requires", () => {
    const fc = fireFeatureCollection([fire]);
    expect(fc.features[0]!.geometry.coordinates).toEqual([4.05, 36.75]);
  });

  it("keeps the remaining fields as properties", () => {
    const fc = fireFeatureCollection([fire]);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features[0]!.type).toBe("Feature");
    expect(fc.features[0]!.properties).toMatchObject({
      short_id: "NDH-7Q2",
      state: "active",
      confidence: 0.82,
    });
  });

  it("does not repeat the coordinates inside properties", () => {
    const fc = fireFeatureCollection([fire]);
    expect(fc.features[0]!.properties).not.toHaveProperty("lat");
    expect(fc.features[0]!.properties).not.toHaveProperty("lon");
  });

  it("returns an empty collection for no fires", () => {
    expect(fireFeatureCollection([])).toEqual({
      type: "FeatureCollection",
      features: [],
    });
  });
});

describe("summariseFires", () => {
  const now = Date.parse("2026-08-28T12:00:00Z");
  const rows = [
    {
      state: "active",
      wilaya_id: "w06",
      last_detected_at: "2026-08-28T11:00:00Z",
    },
    {
      state: "active",
      wilaya_id: "w06",
      last_detected_at: "2026-08-27T23:00:00Z",
    },
    {
      state: "unconfirmed",
      wilaya_id: "w16",
      last_detected_at: "2026-08-28T09:00:00Z",
    },
    {
      state: "extinguished",
      wilaya_id: "w16",
      last_detected_at: "2026-08-20T09:00:00Z",
    },
    {
      state: "active",
      wilaya_id: null,
      last_detected_at: "2026-08-28T10:00:00Z",
    },
  ];

  it("counts fires by state", () => {
    expect(summariseFires(rows, now).by_state).toEqual({
      active: 3,
      unconfirmed: 1,
      extinguished: 1,
    });
  });

  it("counts only fires detected in the last 24 hours as recent", () => {
    expect(summariseFires(rows, now).detected_last_24h).toBe(4);
  });

  it("counts distinct wilayas with a live fire, ignoring unplaced ones", () => {
    expect(summariseFires(rows, now).wilayas_with_live_fires).toBe(2);
  });
});
