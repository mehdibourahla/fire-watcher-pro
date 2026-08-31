import type { Database } from "@/integrations/supabase/types";

type ReplayArgs =
  Database["public"]["Functions"]["enqueue_source_replay"]["Args"];

export type ReplayClient = {
  rpc: (
    name: "enqueue_source_replay",
    args: ReplayArgs,
  ) => PromiseLike<{
    data: string | null;
    error: { message: string } | null;
  }>;
};

export type ReplayClientFactory = (
  url: string,
  serviceRoleKey: string,
) => ReplayClient;

const GAP_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function runReplayCommand(
  args: readonly string[],
  environment: Record<string, string | undefined>,
  createClient: ReplayClientFactory,
  write: (line: string) => void,
): Promise<0> {
  const gapId = args[0];
  if (args.length !== 1 || !gapId || !GAP_ID.test(gapId))
    throw new Error("Expected one recorded source gap UUID");

  const url = environment["SUPABASE_URL"];
  const key = environment["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Replay database configuration is missing");

  const client = createClient(url, key);
  const { data: jobId, error } = await client.rpc("enqueue_source_replay", {
    _gap_id: gapId,
  });
  if (error || !jobId) throw new Error("Could not enqueue source replay");

  write(JSON.stringify({ gapId, jobId, state: "queued" }));
  return 0;
}
