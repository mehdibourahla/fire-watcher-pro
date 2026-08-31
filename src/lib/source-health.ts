import type { PublicSourceReason } from "./source-runs";

export type SourceHealthState =
  | "healthy"
  | "delayed"
  | "degraded"
  | "stale"
  | "unavailable"
  | "backfilling"
  | "paused";

export type SourceCriticality = "critical" | "supporting" | "optional";

export type SourceFreshnessBasis =
  "last_success_at" | "upstream_published_at" | "data_through" | "published_at";

export type SourceHealth = {
  key: string;
  label: string;
  family: string;
  criticality: SourceCriticality;
  state: SourceHealthState;
  freshness_basis: SourceFreshnessBasis;
  valid_at: string | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  published_at: string | null;
  age_minutes: number | null;
  warning_after_minutes: number;
  stale_after_minutes: number;
  coverage_status: "complete" | "partial" | "unknown";
  records_accepted: number;
  records_expected: number | null;
  fallback_contract_key: string | null;
  public_reason_code: PublicSourceReason | null;
};

export function summariseSourceHealth(rows: SourceHealth[]) {
  const affected = rows.filter((source) => source.state !== "healthy");

  return {
    affected: affected.length,
    criticalAffected: affected.filter(
      (source) => source.criticality === "critical",
    ).length,
    capabilityAffected: affected.filter(
      (source) => source.criticality !== "optional",
    ).length,
    allHealthy: affected.length === 0,
  };
}

export function sourceHealthCapabilityAffected(
  rows: SourceHealth[],
  unavailable: boolean,
) {
  return unavailable || summariseSourceHealth(rows).capabilityAffected > 0;
}
