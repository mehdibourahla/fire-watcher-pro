import { archivedFetch } from "@/lib/source-archive.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import type { ClaimedSourceJob } from "@/lib/source-jobs";
import { fetchItaFeed, type ItaFeedPost } from "./ita-feed";
import { extractItaReport, type ItaExtraction } from "./ita-extract.server";

type Revision = {
  source_post_id: string;
  source_page: string;
  source_url: string;
  published_at: string;
  content_hash: string;
  body: string;
  raw: ItaFeedPost;
};
export type ItaStore = {
  etag: () => Promise<string | null>;
  saveFeed: (input: {
    posts: Revision[];
    etag: string | null;
    notModified: boolean;
  }) => Promise<number>;
  claim: (limit: number) => Promise<{ id: string; raw: ItaFeedPost }[]>;
  finish: (
    id: string,
    extraction: ItaExtraction | null,
    error: string | null,
  ) => Promise<void>;
  pendingCount: () => Promise<number>;
};
export type ItaRun = {
  fetched: number;
  stored: number;
  extracted: number;
  failed: number;
  pending: number;
  notModified: boolean;
  error?: string;
};
type Dependencies = {
  store: ItaStore;
  fetchFeed: typeof fetchItaFeed;
  extract: typeof extractItaReport;
};

async function revision(post: ItaFeedPost): Promise<Revision> {
  const canonical = JSON.stringify([
    post.uri,
    post.id,
    post.created_time,
    post.message,
    post.region,
    post.type,
  ]);
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return {
    source_post_id: post.id,
    source_page: post.uri,
    source_url: `https://www.facebook.com/${post.uri}/posts/${post.id.split("_").at(-1)}`,
    published_at: new Date(post.created_time).toISOString(),
    content_hash: [...new Uint8Array(hash)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
    body: post.message,
    raw: post,
  };
}

export async function runItaSourceWith({
  store,
  fetchFeed,
  extract,
}: Dependencies): Promise<ItaRun> {
  const feed = await fetchFeed(await store.etag());
  const stored = await store.saveFeed({
    ...feed,
    posts: await Promise.all(feed.posts.map(revision)),
  });
  const pending = await store.claim(5);
  let extracted = 0;
  let failed = 0;
  let error: string | undefined;
  for (const report of pending) {
    let result: ItaExtraction | null = null;
    let failure: string | null = null;
    try {
      result = await extract(report.raw);
    } catch (cause) {
      failure =
        cause instanceof Error
          ? cause.message.slice(0, 500)
          : "ITA extraction failed";
    }
    await store.finish(report.id, result, failure);
    if (failure) {
      failed++;
      error ??= failure;
    } else extracted++;
  }
  const remaining = await store.pendingCount();
  if (remaining) error ??= `ITA extraction backlog: ${remaining} reports`;
  return {
    fetched: feed.posts.length,
    stored,
    extracted,
    failed,
    pending: remaining,
    notModified: feed.notModified,
    ...(error ? { error } : {}),
  };
}

export async function runItaSource(job: ClaimedSourceJob): Promise<ItaRun> {
  const fence = { _job: job.id, _attempt: job.attempt_count };
  const store: ItaStore = {
    async etag() {
      const { data, error } = await supabaseAdmin
        .from("ita_feed_state")
        .select("etag")
        .eq("singleton", true)
        .single();
      if (error) throw new Error(`ITA checkpoint read: ${error.message}`);
      return data.etag;
    },
    async saveFeed(feed) {
      const { data, error } = await supabaseAdmin.rpc("save_ita_feed", {
        ...fence,
        _posts: feed.posts as unknown as Json,
        _etag: feed.etag,
        _not_modified: feed.notModified,
      });
      if (error) throw new Error(`ITA feed storage: ${error.message}`);
      return data;
    },
    async claim(limit) {
      const { data, error } = await supabaseAdmin.rpc("claim_ita_extractions", {
        ...fence,
        _limit: limit,
      });
      if (error) throw new Error(`ITA extraction claim: ${error.message}`);
      return data.map((row) => ({
        id: row.id,
        raw: row.raw as unknown as ItaFeedPost,
      }));
    },
    async finish(id, extraction, failure) {
      const { error } = await supabaseAdmin.rpc("finish_ita_extraction", {
        ...fence,
        _id: id,
        _extraction: extraction as Json,
        _error: failure,
      });
      if (error) throw new Error(`ITA extraction completion: ${error.message}`);
    },
    async pendingCount() {
      const { count, error } = await supabaseAdmin
        .from("ita_reports")
        .select("id", { count: "exact", head: true })
        .is("extraction", null);
      if (error) throw new Error(`ITA backlog read: ${error.message}`);
      return count ?? 0;
    },
  };
  return runItaSourceWith({
    store,
    fetchFeed: (etag) =>
      fetchItaFeed(etag, (input, init) =>
        archivedFetch("ita_website", "facebook_feed", input, init),
      ),
    extract: extractItaReport,
  });
}
