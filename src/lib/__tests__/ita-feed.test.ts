import { describe, expect, it, vi } from "vitest";
import { fetchItaFeed } from "../text-sources/ita-feed";

const post = {
  id: "808412572528916_1511278197712051",
  uri: "traficalg",
  created_time: "2026-09-08T18:35:11+0000",
  message:
    "🚧 متابعة : وجود أشغال بالطريق السيار شرق غرب على مستوى البويرة اتجاه الجزائر \nحركة السير جد مضطربة بالقطاع.",
  region: "Bouira",
  type: ["iTravaux"],
};

describe("ITA feed", () => {
  it("reads the producer envelope without using its count", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { posts: [post], count: 39 },
        { headers: { etag: '"v1"' } },
      ),
    );
    const result = await fetchItaFeed(null, fetcher);
    expect(result.posts).toEqual([post]);
    expect(result.etag).toBe('"v1"');
    expect(fetcher).toHaveBeenCalledWith(
      "https://infotraficalgerie.com/api/facebook/",
      expect.objectContaining({ redirect: "manual" }),
    );
  });
  it("sends ETag and accepts empty 304", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 304 }));
    expect(await fetchItaFeed('"v1"', fetcher)).toEqual({
      notModified: true,
      etag: '"v1"',
      posts: [],
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ "If-None-Match": '"v1"' }),
      }),
    );
  });
  it.each([
    { posts: [{ ...post, uri: "../../private" }] },
    { posts: [{ ...post, created_time: "yesterday" }] },
    { posts: [post, post] },
    { posts: [{ ...post, message: "" }] },
  ])("rejects invalid batches before checkpointing", async (body) => {
    await expect(
      fetchItaFeed(null, async () => Response.json(body)),
    ).rejects.toThrow();
  });
  it("surfaces upstream errors", async () => {
    await expect(
      fetchItaFeed(
        null,
        async () => new Response("rate limited", { status: 429 }),
      ),
    ).rejects.toThrow("429");
  });
  it.each([301, 302, 303, 307, 308])(
    "rejects redirect %i without following it",
    async (status) => {
      const fetcher = vi.fn(
        async () =>
          new Response(null, {
            status,
            headers: { location: "https://example.com/other-feed" },
          }),
      );
      await expect(fetchItaFeed(null, fetcher)).rejects.toThrow(
        `ITA feed HTTP ${status}`,
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ redirect: "manual" }),
      );
    },
  );
  it("rejects oversized payloads", async () => {
    await expect(
      fetchItaFeed(null, async () => new Response(" ".repeat(2_000_001))),
    ).rejects.toThrow("size");
  });
});
