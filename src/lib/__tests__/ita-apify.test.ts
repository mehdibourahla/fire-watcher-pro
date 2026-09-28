import { describe, expect, it, vi } from "vitest";

import { fetchItaApifyPosts } from "@/lib/text-sources/ita-apify";
import items from "./fixtures/ita-apify-items.json";

const [post, empty] = items as [
  Record<string, unknown> & { text: string },
  unknown,
];
const request = { taskId: "task-1", token: "secret", lookbackMinutes: 25 };
const answering = (body: unknown, status = 201) =>
  vi.fn(async () => Response.json(body, { status }));

describe("ITA Apify fetcher", () => {
  it("flags a window that filled the 20-item limit", async () => {
    const full = Array.from({ length: 20 }, (_, i) => ({
      ...post,
      postId: String(1526895906150280 + i),
    }));
    const result = await fetchItaApifyPosts(request, answering(full));
    expect(result).toMatchObject({ saturated: true, rejected: 0 });
    expect(result.posts).toHaveLength(20);
  });

  it("maps a post to the website feed's identity and asks for the window", async () => {
    const fetcher = answering([post]);
    const result = await fetchItaApifyPosts(request, fetcher);
    expect(result).toEqual({
      rejected: 0,
      saturated: false,
      posts: [
        {
          id: "808412572528916_1526895906150280",
          uri: "traficalg",
          created_time: "2026-09-25T16:34:32Z",
          message: post.text,
          region: "",
          type: [],
        },
      ],
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/api\.apify\.com\/v2\/actor-tasks\/task-1\/run-sync-get-dataset-items\?.*maxTotalChargeUsd=0\.2/,
      ),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer secret" }),
        body: JSON.stringify({
          resultsLimit: 20,
          onlyPostsNewerThan: "25 minutes",
        }),
      }),
    );
  });

  it("reads an empty window as no posts", async () => {
    expect(await fetchItaApifyPosts(request, answering([empty]))).toEqual({
      posts: [],
      rejected: 0,
      saturated: false,
    });
  });

  it("counts an item that fails the schema and keeps one copy of a repeated post", async () => {
    const { text: _text, ...textless } = post;
    const result = await fetchItaApifyPosts(
      request,
      answering([post, post, textless]),
    );
    expect(result.posts).toHaveLength(1);
    expect(result.rejected).toBe(1);
  });

  it("names a capped account in the error", async () => {
    const capped = answering(
      {
        error: {
          type: "platform-feature-disabled",
          message: "Monthly usage hard limit exceeded",
        },
      },
      403,
    );
    await expect(fetchItaApifyPosts(request, capped)).rejects.toThrow(
      "Apify usage cap reached (HTTP 403)",
    );
  });
});
