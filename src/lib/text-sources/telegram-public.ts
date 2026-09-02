export type TelegramPost = {
  externalId: string;
  publishedAt: string;
  text: string;
  url: string;
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#")
      return String.fromCodePoint(
        code[1]?.toLowerCase() === "x"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10),
      );
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

function stripTags(html: string): string {
  let out = html;
  for (let previous = ""; previous !== out;) {
    previous = out;
    out = out.replace(/<[^>]*>/g, "");
  }
  return out;
}

function textOf(html: string): string {
  return decodeEntities(
    stripTags(html.replace(/<br\s*\/?>/gi, "\n")).replace(/\r/g, ""),
  )
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

export function parseTelegramPreview(html: string): TelegramPost[] {
  const posts: TelegramPost[] = [];
  for (const block of html.split(/(?=<div class="tgme_widget_message_wrap)/)) {
    const id = /data-post="([^"]+)"/.exec(block);
    if (!id) continue;
    const time = /<time datetime="([^"]+)"/.exec(block);
    const body = /tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/.exec(block);
    const text = body ? textOf(body[1]!) : "";
    if (!time || !text) continue;
    posts.push({
      externalId: id[1]!,
      publishedAt: time[1]!,
      text,
      url: `https://t.me/${id[1]!}`,
    });
  }
  return posts.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
}

function oldestNumber(posts: TelegramPost[]): number | null {
  const numbers = posts
    .map((p) => Number(p.externalId.split("/").pop()))
    .filter(Number.isFinite);
  return numbers.length ? Math.min(...numbers) : null;
}

export async function fetchNewTelegramPosts(
  channelUrl: string,
  knownIds: ReadonlySet<string>,
  fetchImpl: typeof fetch = fetch,
  maxPages = 5,
): Promise<TelegramPost[]> {
  const fresh = new Map<string, TelegramPost>();
  let before: number | null = null;
  for (let page = 0; page < maxPages; page++) {
    const url = before === null ? channelUrl : `${channelUrl}?before=${before}`;
    const res = await fetchImpl(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; Nadhir/1.0)" },
    });
    if (!res.ok) throw new Error(`telegram preview ${res.status} for ${url}`);
    const posts = parseTelegramPreview(await res.text());
    if (!posts.length) break;
    let metKnown = false;
    for (const post of posts) {
      if (knownIds.has(post.externalId)) metKnown = true;
      else fresh.set(post.externalId, post);
    }
    const oldest = oldestNumber(posts);
    if (metKnown || oldest === null || oldest === before) break;
    before = oldest;
  }
  return [...fresh.values()].sort((a, b) =>
    a.publishedAt.localeCompare(b.publishedAt),
  );
}
