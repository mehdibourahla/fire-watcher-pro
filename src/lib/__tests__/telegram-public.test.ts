import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  fetchNewTelegramPosts,
  parseTelegramPreview,
} from "@/lib/text-sources/telegram-public";

const page = readFileSync(
  join(__dirname, "fixtures", "dgpc", "tme-page.html"),
  "utf8",
);

describe("parseTelegramPreview", () => {
  it("returns text posts oldest-first with id, time and url", () => {
    const posts = parseTelegramPreview(page);
    expect(posts.map((p) => p.externalId)).toEqual([
      "DGPCDZ/6842",
      "DGPCDZ/6853",
      "DGPCDZ/6854",
      "DGPCDZ/6855",
      "DGPCDZ/6856",
      "DGPCDZ/6857",
    ]);
    expect(posts[0]).toMatchObject({
      publishedAt: "2026-08-28T08:33:20+00:00",
      url: "https://t.me/DGPCDZ/6842",
    });
  });

  it("flattens markup into plain lines and keeps emoji glyphs", () => {
    const post = parseTelegramPreview(page).find(
      (p) => p.externalId === "DGPCDZ/6857",
    )!;
    const lines = post.text.split("\n");
    expect(lines[0]).toMatch(/^🔴 الحالة العامة لحرائق/);
    expect(lines[1]).toMatch(/^🔴 العدد الإجمالي للحرائق: 97$/);
    expect(post.text).not.toContain("<");
  });

  it("decodes html entities", () => {
    const html = `<div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="X/1">
      <div class="tgme_widget_message_text js-message_text" dir="auto">a &amp; b&nbsp;c<br/>d &lt;e&gt;</div>
      <time datetime="2026-09-02T10:00:00+00:00"></time></div></div>`;
    expect(parseTelegramPreview(html)[0]!.text).toBe("a & b c\nd <e>");
  });
});

describe("fetchNewTelegramPosts", () => {
  it("stops paging at a known post and returns every unstored post it saw", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      return new Response(page, { status: 200 });
    }) as typeof fetch;
    const posts = await fetchNewTelegramPosts(
      "https://t.me/s/DGPCDZ",
      new Set(["DGPCDZ/6853"]),
      fetchImpl,
    );
    expect(calls).toEqual(["https://t.me/s/DGPCDZ"]);
    expect(posts.map((p) => p.externalId)).toEqual([
      "DGPCDZ/6842",
      "DGPCDZ/6854",
      "DGPCDZ/6855",
      "DGPCDZ/6856",
      "DGPCDZ/6857",
    ]);
  });

  it("stops after the page limit when nothing is known yet", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response(page, { status: 200 });
    }) as typeof fetch;
    const posts = await fetchNewTelegramPosts(
      "https://t.me/s/DGPCDZ",
      new Set(),
      fetchImpl,
      2,
    );
    expect(calls).toEqual([
      "https://t.me/s/DGPCDZ",
      "https://t.me/s/DGPCDZ?before=6842",
    ]);
    expect(new Set(posts.map((p) => p.externalId)).size).toBe(6);
  });

  it("fails loudly on a non-200 response", async () => {
    const fetchImpl = (async () =>
      new Response("blocked", { status: 429 })) as typeof fetch;
    await expect(
      fetchNewTelegramPosts("https://t.me/s/DGPCDZ", new Set(), fetchImpl),
    ).rejects.toThrow("429");
  });
});
