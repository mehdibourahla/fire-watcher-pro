import { supabaseAdmin } from "@/integrations/supabase/client.server";

import {
  sourceRunRpcArgs,
  type SourceRunReport,
  type SourceRunRpcArgs,
} from "./source-runs";

export type SourceRunRpcClient = {
  rpc: (
    name: "record_source_run",
    args: SourceRunRpcArgs,
  ) => Promise<{ error: { message: string } | null }>;
};

export async function recordSourceRunWith(
  client: SourceRunRpcClient,
  report: SourceRunReport,
  now: string,
): Promise<boolean> {
  const { error } = await client.rpc(
    "record_source_run",
    sourceRunRpcArgs(report, now),
  );
  if (!error) return true;

  console.warn(`[source_runs] could not record ${report.contractKey}`);
  return false;
}

export async function recordSourceRun(
  report: SourceRunReport,
): Promise<boolean> {
  return recordSourceRunWith(
    supabaseAdmin as unknown as SourceRunRpcClient,
    report,
    new Date().toISOString(),
  );
}
