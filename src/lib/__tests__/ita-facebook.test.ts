import { describe, expect, it, vi } from "vitest";

import {
  apifyWindow,
  runItaFacebookSourceWith,
} from "@/lib/text-sources/ita-facebook.server";

const post = {
  id: "808412572528916_1526895906150280",
  uri: "traficalg",
  created_time: "2026-09-25T16:34:32Z",
  message: "#حريق #iIncendie 🔥🔥\n\nاشتعال نار فوق بوغلبون بعد نفق عين بوزيان",
  region: "",
  type: [],
};

describe("ITA Facebook collector", () => {
  it.each([
    ["2026-09-28T09:40:00Z", 22, false],
    ["2026-09-28T09:55:00Z", 20, false],
    ["2026-09-28T08:00:00Z", 60, true],
  ])(
    "looks back from data_from %s by %i minutes (truncated: %s)",
    (dataFrom, minutes, truncated) => {
      expect(apifyWindow(dataFrom, Date.parse("2026-09-28T10:00:00Z"))).toEqual(
        { minutes, truncated },
      );
    },
  );

  it("stores the fetched posts as ITA revisions", async () => {
    const save = vi.fn(async () => 1);
    const run = await runItaFacebookSourceWith({
      window: { minutes: 22, truncated: false },
      fetchPosts: async () => ({
        posts: [post],
        rejected: 0,
        saturated: false,
      }),
      save,
    });
    expect(run).toEqual({
      fetched: 1,
      stored: 1,
      rejected: 0,
      lookbackMinutes: 22,
      complete: true,
    });
    expect(save).toHaveBeenCalledWith([
      expect.objectContaining({
        source_post_id: post.id,
        source_page: "traficalg",
        source_url: "https://www.facebook.com/traficalg/posts/1526895906150280",
        body: post.message,
        raw: post,
      }),
    ]);
  });

  it("reports a fetch failure without storing", async () => {
    const save = vi.fn(async () => 0);
    const run = await runItaFacebookSourceWith({
      window: { minutes: 20, truncated: false },
      fetchPosts: async () => {
        throw new Error("Apify usage cap reached (HTTP 403)");
      },
      save,
    });
    expect(run).toEqual({
      fetched: 0,
      stored: 0,
      rejected: 0,
      lookbackMinutes: 20,
      complete: false,
      error: "Apify usage cap reached (HTTP 403)",
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("fails a run whose items no longer match the schema", async () => {
    const run = await runItaFacebookSourceWith({
      window: { minutes: 20, truncated: false },
      fetchPosts: async () => ({ posts: [], rejected: 2, saturated: false }),
      save: async () => 0,
    });
    expect(run.error).toBe("ITA Facebook feed rejected 2 posts");
  });

  it.each([
    [{ minutes: 20, truncated: false }, true],
    [{ minutes: 60, truncated: true }, false],
  ])(
    "marks a saturated or truncated window incomplete",
    async (window, saturated) => {
      const run = await runItaFacebookSourceWith({
        window,
        fetchPosts: async () => ({ posts: [post], rejected: 0, saturated }),
        save: async () => 1,
      });
      expect(run.complete).toBe(false);
    },
  );
});
