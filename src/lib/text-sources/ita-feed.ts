import { z } from "zod/v4";

const PostSchema = z.object({
  id: z.string().regex(/^\d+_\d+$/),
  uri: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
  created_time: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:?\d{2})$/)
    .refine((v) => Number.isFinite(Date.parse(v))),
  message: z
    .string()
    .min(1)
    .max(50_000)
    .refine((v) => v.trim().length > 0),
  region: z.string().max(200),
  type: z.array(z.string().max(100)).max(30),
});
const FeedSchema = z.object({ posts: z.array(PostSchema).max(2000) });
export type ItaFeedPost = z.infer<typeof PostSchema>;

export async function fetchItaFeed(
  etag: string | null,
  fetchImpl: typeof fetch = fetch,
) {
  const response = await fetchImpl(
    "https://infotraficalgerie.com/api/facebook/",
    {
      headers: {
        Accept: "application/json",
        ...(etag ? { "If-None-Match": etag } : {}),
      },
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    },
  );
  if (response.status === 304)
    return { notModified: true, etag, posts: [] as ItaFeedPost[] };
  if (!response.ok) throw new Error(`ITA feed HTTP ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("ITA feed missing body");
  let bytes = 0;
  let text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2_000_000) throw new Error("ITA feed size limit exceeded");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const { posts } = FeedSchema.parse(JSON.parse(text));
  if (new Set(posts.map((p) => `${p.uri}/${p.id}`)).size !== posts.length)
    throw new Error("ITA duplicate source IDs");
  return { notModified: false, etag: response.headers.get("etag"), posts };
}
