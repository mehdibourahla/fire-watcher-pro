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
