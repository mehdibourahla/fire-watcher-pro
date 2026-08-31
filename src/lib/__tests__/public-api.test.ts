import { describe, expect, it } from "vitest";

import {
  fireFeatureCollection,
  serializePublicSourceStatus,
  summariseFires,
} from "@/lib/public-api.server";
import type { SourceHealth } from "@/lib/source-health";

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

const healthySource: SourceHealth = {
  key: "firms",
  label: "NASA FIRMS",
  family: "fire_detection",
  criticality: "critical",
  state: "healthy",
  freshness_basis: "last_success_at",
  valid_at: "2026-08-31T12:00:00.000Z",
  last_attempt_at: "2026-08-31T12:00:00.000Z",
  last_success_at: "2026-08-31T12:00:00.000Z",
  published_at: "2026-08-31T11:55:00.000Z",
  age_minutes: 5,
  warning_after_minutes: 15,
  stale_after_minutes: 25,
  coverage_status: "complete",
  records_accepted: 123,
  records_expected: null,
  fallback_contract_key: null,
  public_reason_code: null,
};

describe("serializePublicSourceStatus", () => {
  it("returns the documented public status contract", () => {
    const generatedAt = "2026-08-31T12:05:00.000Z";

    expect(serializePublicSourceStatus([healthySource], generatedAt)).toEqual({
      generated_at: generatedAt,
      overall: "healthy",
      affected: 0,
      critical_affected: 0,
      sources: [
        {
          key: "firms",
          family: "fire_detection",
          state: "healthy",
          valid_at: "2026-08-31T12:00:00.000Z",
          published_at: "2026-08-31T11:55:00.000Z",
          age_minutes: 5,
          coverage: {
            status: "complete",
            accepted: 123,
            expected: null,
          },
          fallback: null,
          reason: null,
        },
      ],
    });
  });

  it("uses the same affected-state summary as the user interface", () => {
    const delayed = {
      ...healthySource,
      key: "fci",
      state: "delayed" as const,
      public_reason_code: "data_delayed" as const,
    };

    expect(
      serializePublicSourceStatus([healthySource, delayed], "generated"),
    ).toMatchObject({
      overall: "affected",
      affected: 1,
      critical_affected: 1,
    });
  });

  it("drops private and unknown properties instead of spreading database rows", () => {
    const rowWithPrivateFields = {
      ...healthySource,
      private_diagnostic: "token=secret upstream body",
      schema_fingerprint: "private-schema-hash",
      replay_cursor: { page: 42 },
      unexpected_future_column: "must not become public",
    };

    const serialized = serializePublicSourceStatus(
      [rowWithPrivateFields],
      "generated",
    );
    const json = JSON.stringify(serialized);

    expect(json).not.toContain("private_diagnostic");
    expect(json).not.toContain("schema_fingerprint");
    expect(json).not.toContain("replay_cursor");
    expect(json).not.toContain("unexpected_future_column");
    expect(json).not.toContain("token=secret");
  });
});
