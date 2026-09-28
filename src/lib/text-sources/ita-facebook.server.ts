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
  complete: boolean;
  error?: string;
};

type ApifyWindow = { minutes: number; truncated: boolean };
type ApifyBatch = {
  posts: ItaFeedPost[];
  rejected: number;
  saturated: boolean;
};

export function apifyWindow(dataFrom: string, now: number): ApifyWindow {
  const since = Math.ceil((now - Date.parse(dataFrom)) / 60_000) + 2;
  return { minutes: Math.min(Math.max(since, 20), 60), truncated: since > 60 };
}

export async function runItaFacebookSourceWith({
  window,
  fetchPosts,
  save,
}: {
  window: ApifyWindow;
  fetchPosts: () => Promise<ApifyBatch>;
  save: (posts: Revision[]) => Promise<number>;
}): Promise<ItaFacebookRun> {
  let batch: ApifyBatch;
  try {
    batch = await fetchPosts();
  } catch (cause) {
    return {
      fetched: 0,
      stored: 0,
      rejected: 0,
      lookbackMinutes: window.minutes,
      complete: false,
      error:
        cause instanceof Error ? cause.message : "Apify upstream unavailable",
    };
  }
  const stored = await save(await Promise.all(batch.posts.map(revision)));
  return {
    fetched: batch.posts.length,
    stored,
    rejected: batch.rejected,
    lookbackMinutes: window.minutes,
    complete: !window.truncated && !batch.saturated,
    ...(batch.rejected
      ? { error: `ITA Facebook feed rejected ${batch.rejected} posts` }
      : {}),
  };
}

export async function runItaFacebookSource(
  job: ClaimedSourceJob,
): Promise<ItaFacebookRun> {
  const window = apifyWindow(job.data_from, Date.now());
  const token = process.env["APIFY_TOKEN"];
  const taskId = process.env["APIFY_ITA_TASK_ID"];
  if (!token || !taskId)
    return {
      fetched: 0,
      stored: 0,
      rejected: 0,
      lookbackMinutes: window.minutes,
      complete: false,
      error: "APIFY_TOKEN or APIFY_ITA_TASK_ID not configured",
    };
  return runItaFacebookSourceWith({
    window,
    fetchPosts: () =>
      fetchItaApifyPosts(
        { taskId, token, lookbackMinutes: window.minutes },
        (input, init) =>
          archivedFetch("ita_facebook", "apify_posts", input, init, {
            requestParams: {
              lookback_minutes: window.minutes,
              results_limit: 20,
            },
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
