import type { SourceWatchdogIssue } from "@/lib/source-watchdog";

export const WORKER_SILENCE_MINUTES = 25;

/* The in-Worker watchdog cannot report the Worker being dead, which is the failure
 * that silences every short-cadence source at once. Only an outside observer can. */
export function externalWatchdogIssues(input: {
  viewIssues: readonly SourceWatchdogIssue[];
  lastWorkerRunAt: string | null;
  now: number;
  silenceMinutes?: number;
}): SourceWatchdogIssue[] {
  const limit = (input.silenceMinutes ?? WORKER_SILENCE_MINUTES) * 60_000;
  const lastMs = input.lastWorkerRunAt
    ? Date.parse(input.lastWorkerRunAt)
    : null;
  const silent = lastMs === null || input.now - lastMs > limit;
  if (!silent) return [...input.viewIssues];
  return [
    {
      contract_key: "cloudflare",
      issue_code: "worker_silent",
      scheduled_for: null,
      lease_expires_at: null,
      observed_at: input.lastWorkerRunAt,
    },
    ...input.viewIssues,
  ];
}
