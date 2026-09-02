import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { completeSourceJob, claimSourceJob } from "@/lib/source-jobs.server";
import type {
  ClaimedSourceJob,
  SourceExecutionTarget,
  SourceJob,
  SourceJobResult,
} from "@/lib/source-jobs";

import {
  isRuntimeContractKey,
  SOURCE_RUNNERS,
  textSourceRunner,
  type SourceRunner,
  type SourceRunnerRegistry,
} from "./source-runners.server";

export type SourceExecutorInput = {
  target: SourceExecutionTarget;
  workerId: string;
  contractKey?: string;
  now?: string;
};

export type SourceExecutorDependencies = {
  claim: (input: SourceExecutorInput) => Promise<ClaimedSourceJob | null>;
  complete: (
    job: ClaimedSourceJob,
    workerId: string,
    result: SourceJobResult,
  ) => Promise<SourceJob>;
  runners: SourceRunnerRegistry;
  textRunner: (contractKey: string) => Promise<SourceRunner | null>;
};

const sourceExecutorDependencies: SourceExecutorDependencies = {
  claim: (input) =>
    claimSourceJob(supabaseAdmin, {
      workerId: input.workerId,
      target: input.target,
      ...(input.contractKey === undefined
        ? {}
        : { contractKey: input.contractKey }),
      ...(input.now === undefined ? {} : { now: input.now }),
    }),
  complete: (job, workerId, result) =>
    completeSourceJob(supabaseAdmin, job, workerId, result),
  runners: SOURCE_RUNNERS,
  textRunner: textSourceRunner,
};

function runnerFailure(job: ClaimedSourceJob, error: unknown): SourceJobResult {
  return {
    contractKey: job.contract_key,
    trigger: job.trigger_kind,
    scheduledFor: job.scheduled_for,
    startedAt: job.started_at,
    outcome: "failed",
    coverageStatus: "unknown",
    publicReasonCode: "internal_error",
    privateDiagnostic:
      error instanceof Error ? error.message : "unknown source runner failure",
    retryDisposition: "transient",
  };
}

export async function executeNextSourceJob(
  input: SourceExecutorInput,
  dependencies: SourceExecutorDependencies = sourceExecutorDependencies,
): Promise<
  | { claimed: false }
  | { claimed: true; contract: string; state: SourceJob["state"] }
> {
  const job = await dependencies.claim(input);
  if (!job) return { claimed: false };

  let result: SourceJobResult;
  try {
    const runner = isRuntimeContractKey(job.contract_key)
      ? dependencies.runners[job.contract_key]
      : await dependencies.textRunner(job.contract_key);
    if (!runner)
      throw new Error("No runner is registered for the claimed contract");
    result = await runner(job);
  } catch (error) {
    result = runnerFailure(job, error);
  }

  const completed = await dependencies.complete(job, input.workerId, result);
  return {
    claimed: true,
    contract: job.contract_key,
    state: completed.state,
  };
}
