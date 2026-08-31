import { describe, expect, it } from "vitest";

import {
  summariseSourceHealth,
  type SourceHealth,
  type SourceHealthState,
} from "@/lib/source-health";

function source(
  key: string,
  state: SourceHealthState,
  criticality: SourceHealth["criticality"] = "critical",
): SourceHealth {
  return {
    key,
    label: key,
    family: "fire_detection",
    criticality,
    state,
    freshness_basis: "last_success_at",
    valid_at: "2026-08-31T12:00:00.000Z",
    last_attempt_at: "2026-08-31T12:00:00.000Z",
    last_success_at: "2026-08-31T12:00:00.000Z",
    published_at: "2026-08-31T12:00:00.000Z",
    age_minutes: 5,
    warning_after_minutes: 15,
    stale_after_minutes: 25,
    coverage_status: "complete",
    records_accepted: 1,
    records_expected: 1,
    fallback_contract_key: null,
    public_reason_code: null,
  };
}

describe("summariseSourceHealth", () => {
  it("counts every non-healthy state as affected", () => {
    const states: SourceHealthState[] = [
      "healthy",
      "delayed",
      "degraded",
      "stale",
      "unavailable",
      "backfilling",
      "paused",
    ];

    expect(
      summariseSourceHealth(
        states.map((state) => source(state, state, "critical")),
      ),
    ).toEqual({
      affected: 6,
      criticalAffected: 6,
      capabilityAffected: 6,
      allHealthy: false,
    });
  });

  it("does not treat a paused optional enrichment as a core capability outage", () => {
    expect(
      summariseSourceHealth([
        source("firms", "healthy", "critical"),
        source("wind", "paused", "optional"),
      ]),
    ).toEqual({
      affected: 1,
      criticalAffected: 0,
      capabilityAffected: 0,
      allHealthy: false,
    });
  });

  it("includes a delayed supporting source in the homepage capability signal", () => {
    expect(
      summariseSourceHealth([source("effis", "delayed", "supporting")])
        .capabilityAffected,
    ).toBe(1);
  });

  it("reports a fully healthy set without affected capabilities", () => {
    expect(
      summariseSourceHealth([
        source("firms", "healthy"),
        source("wind", "healthy", "optional"),
      ]),
    ).toEqual({
      affected: 0,
      criticalAffected: 0,
      capabilityAffected: 0,
      allHealthy: true,
    });
  });
});
