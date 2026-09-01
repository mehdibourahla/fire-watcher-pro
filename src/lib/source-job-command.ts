import type { SourceJobState } from "./source-jobs";

export type SourceJobCommandResult =
  | { claimed: false; pending: boolean }
  | { claimed: true; contract: string; state: SourceJobState };

/**
 * Exit codes form a small protocol with the GitHub backlog-draining loop:
 * 0 means drained, 76 means one job completed and the caller should claim
 * again, and 75 means the same job is waiting for its bounded retry window.
 */
export function sourceJobCommandExitCode(
  result: SourceJobCommandResult,
): 0 | 1 | 75 | 76 {
  if (!result.claimed) return result.pending ? 75 : 0;
  if (result.state === "succeeded") return 76;
  if (result.state === "retry_wait") return 75;
  return 1;
}
