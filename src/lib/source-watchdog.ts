import type { Database } from "@/integrations/supabase/types";

export const SOURCE_WATCHDOG_ISSUE_CODES = [
  "missing_job",
  "queue_delayed",
  "lease_expired",
  "run_delayed",
] as const;

export type SourceWatchdogIssueCode =
  (typeof SOURCE_WATCHDOG_ISSUE_CODES)[number];

export type SourceWatchdogIssue = Pick<
  Database["public"]["Views"]["source_watchdog"]["Row"],
  | "contract_key"
  | "issue_code"
  | "scheduled_for"
  | "lease_expires_at"
  | "observed_at"
>;

export type SourceWatchdogEvaluation = {
  exitCode: 0 | 1;
  lines: string[];
};

function field(value: string | null): string {
  return value ?? "-";
}

export function evaluateSourceWatchdog(
  issues: readonly SourceWatchdogIssue[],
): SourceWatchdogEvaluation {
  if (issues.length === 0)
    return { exitCode: 0, lines: ["source-watchdog healthy"] };

  return {
    exitCode: 1,
    lines: issues.map(
      (issue) =>
        `contract=${field(issue.contract_key)} issue=${field(issue.issue_code)} scheduled_for=${field(issue.scheduled_for)} lease_expires_at=${field(issue.lease_expires_at)} observed_at=${field(issue.observed_at)}`,
    ),
  };
}
