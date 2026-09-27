# Incident share cards: Stories, posts and link previews

Share an Official Incident to Instagram, Facebook and WhatsApp the way Strava shares an activity:
a carousel of ready-made cards plus link actions. Research of 2026-09-27 decided the mechanics;
sources are listed at the end.

## Rules carried in

- Only an authority's object is shareable: Official Incidents with `authority_tier` national,
  wilaya or forestry, any hazard. Media-tier incidents, Civil Publications and Hazard Reports are
  excluded: the map already shows them as single-source, and review confers no authority.
- Nadhir informs; only authorities direct (ADR 0002). A card never carries an Instruction and
  adds no word to the authority's.
- A share image outlives its data: every card carries an absolute timestamp, never a relative one.

## What the research ruled out

- Meta's Sharing to Stories (the sticker-over-background effect Strava uses) is native iOS/Android
  only and needs a Facebook App ID. A web app cannot call it.
- satori renders Arabic words left to right (vercel/satori#745 still unmerged). Only a real
  browser shapes Arabic and Kabyle correctly on the server.
- `navigator.share` with `url` or `text` next to `files` makes some iOS targets take the link and
  drop the image. Files are shared alone.
- Instagram does not reliably keep PNG transparency on upload, so a sticker sent through the share
  sheet likely lands as a black rectangle.
- WhatsApp silently drops link-preview images above roughly 300 KB.

## Card content

Every format is built from one incident and shows, in order:

1. Attribution: "Official report" and the source label (`official.eyebrow`, `latest_mention.source`).
2. Hazard and status in the authority's vocabulary (`reports.hazardName.*`, `official.statuses.*`).
3. Place: commune and wilaya, or `official.wilayaLevel` when `precision = wilaya`, plus `place_text`.
4. Absolute time in Algiers: "Reported 27 Sep, 14:32".
5. Map: the commune shape shaded inside its wilaya outline, SVG from `admin_units.geom`, no tiles.
   Wilaya rows carry no geom (all 69 null, 2026-09-27), so the wilaya is drawn as its communes
   under one group opacity, which hides the shared borders.
   The incident is known to commune precision; a pin on a street map would claim more.
6. `nadhir.app` printed as the way back (a UUID is never retyped; no `short_id` migration).

No emergency number on the card. Language is the sharer's locale among ar, fr and en; Kabyle is
withheld from the pickers until reviewed, so it is not offered.

Formats: `story` 1080×1920 PNG, `post` 1080×1350 PNG, `sticker` 960×600 transparent PNG (hazard icon,
hazard·status, commune, time, `nadhir.app` on a solid rounded plate, no map), `og` 1200×630 JPEG
under 300 KB.

## Architecture

**`/incident/$id`** public landing page. SSR loader uses a new `officialIncidentQuery(id)` with no
72 h window, so an old link still opens; media-tier or unknown ids are `notFound()`. `head` sets
per-incident `og:title`, `og:description`, `og:image` (`…/og?lang=<lang>&v=<updated_at>`),
`og:image:width`/`height` and `twitter:card=summary_large_image`. The link carries `?lang=` because
crawlers have no locale cookie (`headTranslator` reads only the cookie); without it the app's
default locale is used. Body reuses
`OfficialIncidentDetail`, adds "See on the map" (`/?event=official:<id>`) and the share button.

**`/share-card/incident/$id?format=&lang=`** renders only the card at its exact pixel size, no site
chrome, `noindex`. Geometry loads in the browser (SSR geometry once exceeded the Worker's memory).
Sets `data-card-ready` once fonts and SVG are ready, `data-card-error` if a fetch fails.

**`/api/public/share/incident/$id/$format`** returns the image. Cache API lookup keyed on
id + format + lang + `updated_at` (set by `bump_official_incident` on every status change, so
it versions everything the card shows; `as_of` does not); on a miss, validate the incident (exists, not media tier) and format,
then Cloudflare Browser Run: viewport at format size, load the card route, wait for
`[data-card-ready]` (15 s cap), screenshot (`omitBackground` for sticker, JPEG for og), store
immutable. The Cache API is per data centre, so each location renders once per version; R2 only
if that proves costly. New dependency `@cloudflare/puppeteer` and a `browser` binding in the nitro
wrangler config. Under `vite dev` the binding is absent and the endpoint answers 501.

Cost: Workers Paid includes 10 browser-hours a month, then $0.09 an hour.

## Share sheet

`IncidentShareSheet` on `ui/sheet.tsx`, no new client dependency. A scroll-snap carousel of
Story, Post and Sticker (direction follows RTL), then two rows:

- Image (acts on the card in view): **Share image** calls `navigator.share({ files })`, shown only
  when `navigator.canShare({ files })` is true; **Save** downloads, and is primary where Share
  image is hidden. All three PNGs are fetched into `File`s when the sheet opens (their thumbnails
  are visible together), so the tap shares immediately. `AbortError` is silent.
- Link (always the `/incident` URL with `?lang=`): WhatsApp (`wa.me/?text=`), Facebook
  (`facebook.com/sharer/sharer.php?u=`), Copy. No Instagram link action: Instagram has none on the web.

The sticker card replaces Share image with **Copy sticker**:
`navigator.clipboard.write([new ClipboardItem({ "image/png": blobPromise })])` (the promise form
keeps Safari's user activation), then the hint "Open your Instagram story and paste".
Whether Instagram's story editor keeps the transparency is unverified: it is tested on a
`wrangler versions upload` preview (CI deploys only main) on one iPhone and one Android phone,
and the sticker is kept or deleted in the same PR.

Entry points: `/incident/$id` and the map's `OfficialIncidentDetail` panel. `/fire/$id` keeps its
link-only button. A `shareCard` string block in ar, fr, en and kab (kab carries the French text until reviewed).
Left out: Telegram and X.

## Failure handling

- Endpoint: unknown or media-tier id 404; bad format 400; Browser Run timeout, quota or a
  `data-card-error` page 503 with `Retry-After`, logged, never cached. No partial card is served.
- Sheet: a failed card shows its own error with retry; the other cards and the link row still
  work. Share image stays disabled until its `File` exists. A clipboard rejection shows a toast.
- A crawler that gets 503 shows a preview without an image and re-scrapes later; accepted.

## Testing

- Unit (vitest): a pure `incidentCardModel(incident, locale)` covering attribution first, status
  from the authority's vocabulary, wilaya-precision wording, absolute Algiers time, media tier
  rejected. Fixtures follow the `officialIncidentsQuery` select shape, not an invented one.
- Unit: cache key and format validation in the endpoint, with the browser call injected.
- Visual: Playwright screenshots of the card route in dev, 4 formats × ar/fr/en, checked for
  Arabic shaping, RTL order and nothing clipped.
- On the preview version: render time measured (1–3 s is a guess); Share image into Instagram Story,
  Facebook Story and WhatsApp on iPhone Safari and Android Chrome; Copy sticker pasted into an
  Instagram story; link preview checked with Facebook's Sharing Debugger and a WhatsApp message.

## Sources

- Meta Sharing to Stories: developers.facebook.com/docs/instagram-platform/sharing-to-stories/
- satori RTL: github.com/vercel/satori/pull/745, github.com/vercel/satori/issues/74
- Web Share files: web.dev/articles/web-share
- iOS files-only: dev.to/shibowen336/sharing-a-canvas-generated-image-on-ios-with-the-web-share-api-2j0m
- Activation timing: sudolabs.com/insights/share-visual-content-from-web-to-social-media-without-api-or-sdk
- WhatsApp preview size: opengraph.to/articles/og-image-too-large
- Browser Run pricing: developers.cloudflare.com/browser-rendering/pricing/
- Strava flows: mobbin.com/flows/38aaf14f-cd60-4348-bc6c-4caddcb33ac8,
  mobbin.com/flows/ae13df4f-3902-4373-853e-eea3bd3b19f1
