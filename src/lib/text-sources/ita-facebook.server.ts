import { archivedFetch } from "@/lib/source-archive.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import type { ClaimedSourceJob } from "@/lib/source-jobs";
import type { ItaFeedPost } from "./ita-feed";
import { fetchItaApifyPosts } from "./ita-apify";
import { revision, type Revision } from "./ita-pipeline.server";

export type ItaFacebookRun = {
  fetched: number;
  stored: number;
  rejected: number;
  lookbackMinutes: number;
  error?: string;
};

export function apifyLookback(dataFrom: string, now: number): number {
  const since = Math.ceil((now - Date.parse(dataFrom)) / 60_000) + 2;
  return Math.min(Math.max(since, 20), 60);
}

export async function runItaFacebookSourceWith({
  lookbackMinutes,
  fetchPosts,
  save,
}: {
  lookbackMinutes: number;
  fetchPosts: () => Promise<{ posts: ItaFeedPost[]; rejected: number }>;
  save: (posts: Revision[]) => Promise<number>;
}): Promise<ItaFacebookRun> {
  let batch: { posts: ItaFeedPost[]; rejected: number };
  try {
    batch = await fetchPosts();
  } catch (cause) {
    return {
      fetched: 0,
      stored: 0,
      rejected: 0,
      lookbackMinutes,
      error:
        cause instanceof Error ? cause.message : "Apify upstream unavailable",
    };
  }
  const stored = await save(await Promise.all(batch.posts.map(revision)));
  return {
    fetched: batch.posts.length,
    stored,
    rejected: batch.rejected,
    lookbackMinutes,
    ...(batch.rejected
      ? { error: `ITA Facebook feed rejected ${batch.rejected} posts` }
      : {}),
  };
}

export async function runItaFacebookSource(
  job: ClaimedSourceJob,
): Promise<ItaFacebookRun> {
  const minutes = apifyLookback(job.data_from, Date.now());
  const token = process.env["APIFY_TOKEN"];
  const taskId = process.env["APIFY_ITA_TASK_ID"];
  if (!token || !taskId)
    return {
      fetched: 0,
      stored: 0,
      rejected: 0,
      lookbackMinutes: minutes,
      error: "APIFY_TOKEN or APIFY_ITA_TASK_ID not configured",
    };
  return runItaFacebookSourceWith({
    lookbackMinutes: minutes,
    fetchPosts: () =>
      fetchItaApifyPosts(
        { taskId, token, lookbackMinutes: minutes },
        (input, init) =>
          archivedFetch("ita_facebook", "apify_posts", input, init, {
            requestParams: { lookback_minutes: minutes, results_limit: 20 },
          }),
      ),
    async save(posts) {
      const { data, error } = await supabaseAdmin.rpc(
        "save_ita_facebook_posts",
        {
          _job: job.id,
          _attempt: job.attempt_count,
          _posts: posts as unknown as Json,
        },
      );
      if (error) throw new Error(`ITA Facebook storage: ${error.message}`);
      return data;
    },
  });
}
