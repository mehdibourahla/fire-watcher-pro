import type { OfficialIncident } from "@/lib/nadhir";
import {
  SHARE_FORMATS,
  isShareFormat,
  isShareable,
  shareCardPath,
  shareLocale,
  type ShareFormat,
} from "@/lib/share-card";

export type Screenshotter = (
  url: string,
  format: ShareFormat,
) => Promise<Uint8Array<ArrayBuffer>>;
type CacheLike = Pick<Cache, "match" | "put">;

export type ShareDeps = {
  load: (id: string) => Promise<OfficialIncident | null>;
  screenshot: Screenshotter | null;
  cache: CacheLike | null;
  limit: () => Promise<Response | null>;
};

type Input = {
  id: string;
  format: string;
  lang: string | null;
  v: string | null;
  origin: string;
};

const IMMUTABLE = "public, max-age=31536000, immutable";

export async function handleShareImage(input: Input, deps: ShareDeps) {
  if (!isShareFormat(input.format))
    return new Response("unknown format", { status: 400 });
  const format = input.format;
  const incident = await deps.load(input.id);
  if (!incident || !isShareable(incident))
    return new Response("not found", { status: 404 });
  const lang = shareLocale(input.lang);
  const version = String(Date.parse(incident.updated_at));
  const type =
    SHARE_FORMATS[format].type === "jpeg" ? "image/jpeg" : "image/png";
  const headers = {
    "content-type": type,
    "cache-control": input.v === version ? IMMUTABLE : "public, max-age=60",
  };
  const key = new Request(
    `${input.origin}/__share/${incident.id}/${format}/${lang}/${version}`,
  );
  const hit = await deps.cache?.match(key);
  if (hit) return new Response(hit.body, { headers });
  if (!deps.screenshot)
    return new Response("browser rendering unavailable here", { status: 501 });
  const limited = await deps.limit();
  if (limited) return limited;
  let image: Uint8Array<ArrayBuffer>;
  try {
    image = await deps.screenshot(
      `${input.origin}${shareCardPath(incident.id, format, lang)}`,
      format,
    );
  } catch (failure) {
    console.error("share card render failed", incident.id, format, failure);
    return new Response("render failed", {
      status: 503,
      headers: { "retry-after": "30" },
    });
  }
  await deps.cache?.put(
    key,
    new Response(image, {
      headers: { "content-type": type, "cache-control": IMMUTABLE },
    }),
  );
  return new Response(image, { headers });
}

export async function browserScreenshotter(): Promise<Screenshotter | null> {
  const binding = (await import("cloudflare:workers")).env["BROWSER"];
  if (!binding) return null;
  const { default: puppeteer } = await import("@cloudflare/puppeteer");
  return async (url, format) => {
    const { width, height, type } = SHARE_FORMATS[format];
    const browser = await puppeteer.launch(
      binding as Parameters<typeof puppeteer.launch>[0],
    );
    try {
      const page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.goto(url, { waitUntil: "networkidle0", timeout: 15_000 });
      const card = await page.waitForSelector(
        "[data-card-ready],[data-card-error]",
        { timeout: 15_000 },
      );
      if (await card?.evaluate((el) => el.hasAttribute("data-card-error")))
        throw new Error("card reported an error");
      return (await page.screenshot(
        type === "jpeg"
          ? { type: "jpeg", quality: 80 }
          : { type: "png", omitBackground: format === "sticker" },
      )) as Uint8Array<ArrayBuffer>;
    } finally {
      await browser.close();
    }
  };
}
