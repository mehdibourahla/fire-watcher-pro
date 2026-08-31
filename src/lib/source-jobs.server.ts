import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

import {
  claimedSourceJobFromRow,
  sourceJobFromRow,
  type ClaimedSourceJob,
  type SourceExecutionTarget,
  type SourceJob,
  type SourceJobResult,
} from "./source-jobs";

type SourceJobRpcClient = Pick<SupabaseClient<Database>, "rpc">;
type ClaimArgs = Database["public"]["Functions"]["claim_source_job"]["Args"];
type GeneratedCompleteArgs =
  Database["public"]["Functions"]["complete_source_job"]["Args"];
type NullableCompleteArg =
  | "_data_from"
  | "_data_through"
  | "_private_diagnostic"
  | "_public_reason_code"
  | "_published_at"
  | "_records_expected"
  | "_upstream_published_at"
  | "_validated_at";
type CompleteArgs = Omit<GeneratedCompleteArgs, NullableCompleteArg> & {
  [Key in NullableCompleteArg]: GeneratedCompleteArgs[Key] | null;
};

function rpcFailure(operation: "claim" | "enqueue" | "complete"): Error {
  return new Error(`Could not ${operation} source job`);
}

export async function claimSourceJob(
  client: SourceJobRpcClient,
  input: {
    workerId: string;
    target: SourceExecutionTarget;
    contractKey?: string;
    now?: string;
  },
): Promise<ClaimedSourceJob | null> {
  const args: ClaimArgs = {
    _worker_id: input.workerId,
    _execution_target: input.target,
    ...(input.contractKey === undefined
      ? {}
      : { _contract_key: input.contractKey }),
    ...(input.now === undefined ? {} : { _now: input.now }),
  };
  const { data, error } = await client.rpc("claim_source_job", args);
  if (error) throw rpcFailure("claim");

  const row = data?.[0];
  return row ? claimedSourceJobFromRow(row) : null;
}

export async function enqueueDueSourceJobs(
  client: SourceJobRpcClient,
  observedAt: string,
  enqueuedBy: "database" | "cloudflare",
): Promise<number> {
  const { data, error } = await client.rpc("enqueue_due_source_jobs", {
    _observed_at: observedAt,
    _enqueued_by: enqueuedBy,
  });
  if (error) throw rpcFailure("enqueue");
  return data;
}

function completionArgs(
  job: ClaimedSourceJob,
  workerId: string,
  result: SourceJobResult,
): CompleteArgs {
  const finishedAt = result.finishedAt ?? new Date().toISOString();
  const succeeded = result.outcome === "succeeded";

  return {
    _job_id: job.id,
    _worker_id: workerId,
    _attempt: job.attempt_count,
    _finished_at: finishedAt,
    _outcome: result.outcome,
    _upstream_published_at: result.upstreamPublishedAt ?? null,
    _data_from: result.dataFrom ?? null,
    _data_through: result.dataThrough ?? null,
    _validated_at: succeeded
      ? (result.validatedAt ?? finishedAt)
      : (result.validatedAt ?? null),
    _published_at: succeeded
      ? (result.publishedAt ?? finishedAt)
      : (result.publishedAt ?? null),
    _records_seen: result.recordsSeen ?? 0,
    _records_inserted: result.recordsInserted ?? 0,
    _records_updated: result.recordsUpdated ?? 0,
    _records_rejected: result.recordsRejected ?? 0,
    _records_expected: result.recordsExpected ?? null,
    _coverage_status: result.coverageStatus,
    _quality_checks: result.qualityChecks ?? {},
    _public_reason_code: result.publicReasonCode ?? null,
    _private_diagnostic: result.privateDiagnostic ?? null,
    _retryable: result.retryDisposition === "transient",
  };
}

export async function completeSourceJob(
  client: SourceJobRpcClient,
  job: ClaimedSourceJob,
  workerId: string,
  result: SourceJobResult,
): Promise<SourceJob> {
  const { data, error } = await client.rpc(
    "complete_source_job",
    completionArgs(job, workerId, result),
  );
  if (error || !data) throw rpcFailure("complete");
  return sourceJobFromRow(data);
}
