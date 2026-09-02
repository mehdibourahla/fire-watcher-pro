import { textOf, type TelegramPost } from "./telegram-public";

function field(item: string, tag: string): string | null {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(item);
  if (!m) return null;
  const raw = m[1]!.trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(raw);
  return cdata ? cdata[1]! : raw;
}

// El Khabar and El Bilad stamp "HH:MM | DD-MM-YYYY" in Algiers time instead of RFC 822
function publishedAt(raw: string): string | null {
  const dz = /^(\d{1,2}):(\d{2})\s*\|\s*(\d{2})-(\d{2})-(\d{4})$/.exec(raw);
  if (dz) {
    const [, h, mi, d, mo, y] = dz;
    return new Date(
      `${y}-${mo}-${d}T${h!.padStart(2, "0")}:${mi}:00+01:00`,
    ).toISOString();
  }
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function parseRssItems(xml: string): TelegramPost[] {
  const posts: TelegramPost[] = [];
  for (const m of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/g)) {
    const item = m[1]!;
    const link = field(item, "link");
    const externalId = field(item, "guid") ?? link;
    const date = field(item, "pubDate");
    const title = field(item, "title");
    if (!externalId || !link || !date || !title) continue;
    const published = publishedAt(date);
    if (!published) continue;
    const body =
      field(item, "content:encoded") ?? field(item, "description") ?? "";
    const text = [textOf(title), textOf(body)]
      .filter(Boolean)
      .join("\n")
      .trim();
    posts.push({ externalId, publishedAt: published, text, url: link });
  }
  return posts.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
}

export async function fetchNewRssItems(
  feedUrl: string,
  knownIds: ReadonlySet<string>,
  fetchImpl: typeof fetch = fetch,
): Promise<TelegramPost[]> {
  const res = await fetchImpl(feedUrl, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; Nadhir/1.0)" },
  });
  if (!res.ok) throw new Error(`rss ${res.status} for ${feedUrl}`);
  const posts = parseRssItems(await res.text());
  if (!posts.length) throw new Error(`rss feed has no items: ${feedUrl}`);
  return posts.filter((p) => !knownIds.has(p.externalId));
}

const FIRE_TERMS =
  /حريق|حرائق|النيران|إخماد|اشتعال|incendies?|feux? de for[eê]ts?|feux? de v[ée]g[ée]tation|flammes|brasier/i;

export function isFireRelevant(text: string): boolean {
  return FIRE_TERMS.test(text);
}
