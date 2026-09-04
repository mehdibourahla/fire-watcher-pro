import { createFileRoute } from "@tanstack/react-router";

import type { SourceHealth } from "@/lib/source-health";

export const Route = createFileRoute("/api/public/v1/status")({
  server: {
    handlers: {
      ANY: async () => {
        const { methodNotAllowed } = await import("@/lib/public-api.server");
        return methodNotAllowed();
      },
      OPTIONS: async () => {
        const { preflight } = await import("@/lib/public-api.server");
        return preflight();
      },
      GET: async ({ request }) => {
        const {
          enforceRateLimit,
          json,
          publicSupabase,
          serializePublicSourceStatus,
        } = await import("@/lib/public-api.server");
        const limited = await enforceRateLimit(request);
        if (limited) return limited;

        const { data, error } = await publicSupabase()
          .from("source_health")
          .select(
            "key, label, family, criticality, state, freshness_basis, valid_at, last_attempt_at, last_success_at, published_at, age_minutes, warning_after_minutes, stale_after_minutes, coverage_status, records_accepted, records_expected, fallback_contract_key, public_reason_code",
          )
          .order("key");

        if (error) return json({ error: "source status unavailable" }, 502);

        return json(
          serializePublicSourceStatus((data ?? []) as SourceHealth[]),
        );
      },
    },
  },
});
