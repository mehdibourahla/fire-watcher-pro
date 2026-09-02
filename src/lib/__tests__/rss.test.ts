import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  fetchNewRssItems,
  isFireRelevant,
  parseRssItems,
} from "@/lib/text-sources/rss";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "fixtures", "rss", name), "utf8");

describe("parseRssItems", () => {
  it("reads a WordPress feed: guid, RFC 822 date, title plus full content", () => {
    const posts = parseRssItems(fixture("tsa-sample.xml"));
    expect(posts).toHaveLength(2);
    const convoy = posts.find(
      (p) => p.externalId === "https://www.tsa-algerie.com/?p=300383",
    )!;
    expect(convoy.publishedAt).toBe("2026-09-02T20:20:54.000Z");
    expect(convoy.url).toMatch(
      /^https:\/\/www\.tsa-algerie\.com\/incendies-en-algerie/,
    );
    expect(convoy.text.startsWith("Incendies en Algérie")).toBe(true);
    expect(convoy.text).toContain("diaspora");
    expect(convoy.text).not.toContain("<p>");
    expect(convoy.text).not.toContain("&#8230;");
  });

  it("reads El Khabar's Algiers-time date stamp and falls back to the link as id", () => {
    const posts = parseRssItems(fixture("elkhabar-sample.xml"));
    expect(posts).toHaveLength(2);
    const p = posts[1]!;
    expect(p.externalId).toBe(p.url);
    expect(p.publishedAt).toBe("2026-09-02T20:31:00.000Z");
    expect(p.text).toContain("بداري");
    expect(p.text).not.toContain("<img");
  });

  it("returns oldest first", () => {
    const posts = parseRssItems(fixture("tsa-sample.xml"));
    expect(posts[0]!.publishedAt <= posts[1]!.publishedAt).toBe(true);
  });
});

describe("fetchNewRssItems", () => {
  it("returns only unknown items and fails loudly on an empty feed", async () => {
    const xml = fixture("tsa-sample.xml");
    const known = new Set(["https://www.tsa-algerie.com/?p=300383"]);
    const fresh = await fetchNewRssItems(
      "https://feed",
      known,
      async () => new Response(xml, { status: 200 }),
    );
    expect(fresh).toHaveLength(1);
    await expect(
      fetchNewRssItems(
        "https://feed",
        new Set(),
        async () => new Response("<rss/>", { status: 200 }),
      ),
    ).rejects.toThrow(/no items/);
    await expect(
      fetchNewRssItems(
        "https://feed",
        new Set(),
        async () => new Response("", { status: 503 }),
      ),
    ).rejects.toThrow(/503/);
  });
});

describe("isFireRelevant", () => {
  it("matches fire vocabulary in Arabic and French, and nothing else", () => {
    expect(isFireRelevant("إخماد حريق غابة بولاية جيجل")).toBe(true);
    expect(isFireRelevant("Incendies : un convoi de solidarité")).toBe(true);
    expect(isFireRelevant("Trois feux de forêt maîtrisés à Béjaïa")).toBe(true);
    expect(isFireRelevant("بداري يدرس التحضيرات الخاصة بالدخول الجامعي")).toBe(
      false,
    );
    expect(
      isFireRelevant("Hattab prend ses fonctions au ministère du Travail"),
    ).toBe(false);
  });
});
