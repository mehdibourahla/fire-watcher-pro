import { z } from "zod/v4";

import type { ItaFeedPost } from "./ita-feed";

const ItemSchema = z.object({
  postId: z.string().regex(/^\d+$/),
  pageName: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
  time: z.string().refine((v) => Number.isFinite(Date.parse(v))),
  text: z
    .string()
    .max(50_000)
    .refine((v) => v.trim().length > 0),
  pageAdLibrary: z.object({ id: z.string().regex(/^\d+$/) }),
});
const EmptySchema = z.object({ error: z.literal("no_items") });

export type ItaApifyRequest = {
  taskId: string;
  token: string;
  lookbackMinutes: number;
};

export async function fetchItaApifyPosts(
  { taskId, token, lookbackMinutes }: ItaApifyRequest,
  fetchImpl: typeof fetch = fetch,
) {
  const response = await fetchImpl(
    `https://api.apify.com/v2/actor-tasks/${encodeURIComponent(taskId)}/run-sync-get-dataset-items?timeout=100&clean=1&maxItems=20&maxTotalChargeUsd=0.2`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        resultsLimit: 20,
        onlyPostsNewerThan: `${lookbackMinutes} minutes`,
      }),
      signal: AbortSignal.timeout(120_000),
      redirect: "manual",
    },
  );
  if (!response.ok) {
    const body = await response.text();
    const cause = /hard limit/i.test(body)
      ? "Apify usage cap reached"
      : "Apify run failed";
    throw new Error(`${cause} (HTTP ${response.status})`);
  }
  const items = z
    .array(z.unknown())
    .max(100)
    .parse(await response.json());
  const posts: ItaFeedPost[] = [];
  const seen = new Set<string>();
  let rejected = 0;
  for (const raw of items) {
    if (EmptySchema.safeParse(raw).success) continue;
    const item = ItemSchema.safeParse(raw);
    if (!item.success) {
      rejected++;
      continue;
    }
    const id = `${item.data.pageAdLibrary.id}_${item.data.postId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    posts.push({
      id,
      uri: item.data.pageName,
      created_time: new Date(item.data.time)
        .toISOString()
        .replace(/\.\d{3}Z$/, "Z"),
      message: item.data.text,
      region: "",
      type: [],
    });
  }
  return { posts, rejected };
}
