# Incident Share Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Share an Official Incident to Instagram/Facebook/WhatsApp as Story, Post and Sticker images plus a link with a per-incident preview.

**Architecture:** One HTML card route renders every format; a Worker endpoint screenshots it with Cloudflare Browser Run and caches the image per incident version. A landing page `/incident/$id` carries the link preview, and a Strava-style bottom sheet shares images through `navigator.share({ files })`.

**Tech Stack:** TanStack Start (React 19), Supabase, Cloudflare Workers (nitro `cloudflare-module`), `@cloudflare/puppeteer`, vitest, i18next.

Spec: `docs/superpowers/specs/2026-09-27-incident-share-cards.md`.

## Global Constraints

- Shareable = Official Incident with `authority_tier` in national, wilaya, forestry. Media tier is 404 everywhere.
- Card wording comes only from existing keys `official.*`, `reports.hazardName.*`, `civilMap.fire`; no Instruction, no emergency number.
- Card locales: `ar`, `fr`, `en` (`LOCALES`); anything else falls back to `ar`. Kabyle is withheld from pickers.
- Timestamps on cards are absolute, Africa/Algiers, never relative.
- Cache version is `official_incidents.updated_at` (set by `bump_official_incident` on every status change).
- Formats: story 1080×1920 PNG, post 1080×1350 PNG, sticker 960×600 transparent PNG, og 1200×630 JPEG quality 80.
- `navigator.share` gets `{ files }` only, never `url`/`text`.
- Zero comments unless a one-line non-obvious why. No new client dependency.
- Gates before every commit (from `.github/workflows/ci.yml`): `bunx tsc --noEmit`, `bun run test`, `bun run lint`.

---

### Task 1: Card model, incident fetch, strings, spec corrections

**Files:**
- Create: `src/lib/share-card.ts`
- Test: `src/lib/__tests__/share-card.test.ts`
- Modify: `src/lib/nadhir.ts` (official incident columns, `updated_at`, `fetchOfficialIncident`)
- Modify: `src/components/nadhir/OfficialIncidentDetail.tsx` (import `HAZARD_NAME`)
- Modify: `src/i18n/locales/{en,fr,ar,kab}.ts` (new `shareCard` block)
- Modify: `docs/superpowers/specs/2026-09-27-incident-share-cards.md`

**Interfaces:**
- Produces: `SHARE_FORMATS`, `ShareFormat`, `isShareFormat(v)`, `shareLocale(v): Locale`, `HAZARD_NAME`, `isShareable(i)`, `incidentCardModel(i, t, locale): IncidentCard`, `algiersDateTime(iso, locale)`, `shareImagePath(id, format, lang, updatedAt)`, `shareCardPath(id, format, lang)`, `incidentUrl(origin, id, lang)`, `linkTargets(url)`, `SITE_URL`; in `nadhir.ts`: `OfficialIncident.updated_at`, `fetchOfficialIncident(client, id)`.

- [ ] **Step 1: Write the failing tests** — `src/lib/__tests__/share-card.test.ts`

```ts
import { describe, expect, it } from "vitest";

import type { OfficialIncident } from "@/lib/nadhir";
import {
  algiersDateTime,
  incidentCardModel,
  isShareable,
  linkTargets,
  shareImagePath,
  shareLocale,
} from "@/lib/share-card";

const t = (key: string, vars?: Record<string, string>) =>
  vars ? `${key}${JSON.stringify(vars)}` : key;

const unit = (name: string) => ({
  name_ar: `${name}-ar`,
  name_fr: `${name}-fr`,
  name_en: `${name}-en`,
  name_kab: null,
  lat: 36,
  lon: 4,
});

const incident = (over: Partial<OfficialIncident> = {}): OfficialIncident => ({
  id: "0b5c1f2e-8f4a-4c55-9a51-3f1c2f0c9b10",
  wilaya_id: "w",
  commune_id: "c",
  kind: "vegetation",
  status: "ongoing",
  precision: "commune",
  authority_tier: "national",
  place_text: null,
  first_reported_at: "2026-09-27T10:00:00Z",
  last_reported_at: "2026-09-27T13:32:00Z",
  as_of: "2026-09-27T13:32:00Z",
  updated_at: "2026-09-27T13:40:00Z",
  unlisted_at: null,
  mention_count: 1,
  evidence: "…",
  commune: unit("Azazga"),
  wilaya: unit("Tizi Ouzou"),
  latest_mention: {
    document: { url: "https://t.me/x/1", published_at: "2026-09-27T13:32:00Z" },
    source: { label: "Protection Civile" },
  },
  ...over,
});

describe("incidentCardModel", () => {
  it("puts the authority first, falling back when the source is unnamed", () => {
    expect(incidentCardModel(incident(), t, "en")).toMatchObject({
      eyebrow: "official.eyebrow",
      source: "Protection Civile",
    });
    expect(
      incidentCardModel(incident({ latest_mention: null }), t, "en").source,
    ).toBe("official.sourceFallback");
  });

  it("names the hazard and status in the authority's vocabulary", () => {
    expect(incidentCardModel(incident(), t, "en")).toMatchObject({
      fire: true,
      hazard: "civilMap.fire",
      status: "official.statuses.ongoing",
    });
    expect(
      incidentCardModel(incident({ kind: "flood", status: "monitoring" }), t, "en"),
    ).toMatchObject({
      fire: false,
      hazard: "reports.hazardName.flooding",
      status: "official.statuses.monitoring",
    });
  });

  it("falls back to the wilaya when the report is only wilaya-precise", () => {
    expect(
      incidentCardModel(incident({ precision: "wilaya" }), t, "fr"),
    ).toMatchObject({ place: "Tizi Ouzou-fr", region: "official.wilayaLevel" });
    expect(incidentCardModel(incident(), t, "fr")).toMatchObject({
      place: "Azazga-fr",
      region: 'official.inWilaya{"wilaya":"Tizi Ouzou-fr"}',
    });
  });

  it("stamps an absolute Algiers time, never a relative one", () => {
    expect(algiersDateTime("2026-09-27T13:32:00Z", "en")).toMatch(/14:32/);
    expect(incidentCardModel(incident(), t, "en").time).toContain("14:32");
  });
});

describe("share helpers", () => {
  it("refuses media-tier incidents", () => {
    expect(isShareable(incident())).toBe(true);
    expect(isShareable(incident({ authority_tier: "media" }))).toBe(false);
  });

  it("versions image URLs by updated_at", () => {
    expect(shareImagePath("abc", "og", "fr", "2026-09-27T13:40:00Z")).toBe(
      `/api/public/share/incident/abc/og?lang=fr&v=${Date.parse("2026-09-27T13:40:00Z")}`,
    );
  });

  it("accepts only picker locales", () => {
    expect(shareLocale("fr")).toBe("fr");
    expect(shareLocale("kab")).toBe("ar");
    expect(shareLocale(null)).toBe("ar");
  });

  it("encodes the link for WhatsApp and Facebook", () => {
    expect(linkTargets("https://nadhir.app/incident/a?lang=fr")).toEqual({
      whatsapp: "https://wa.me/?text=https%3A%2F%2Fnadhir.app%2Fincident%2Fa%3Flang%3Dfr",
      facebook:
        "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fnadhir.app%2Fincident%2Fa%3Flang%3Dfr",
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test src/lib/__tests__/share-card.test.ts`
Expected: FAIL, cannot resolve `@/lib/share-card`.

- [ ] **Step 3: Add `updated_at` and `fetchOfficialIncident` to `src/lib/nadhir.ts`**

Add `updated_at: string;` after `as_of` in `OfficialIncident`. Extract the select string of `officialIncidentsQuery` into a constant with `updated_at` added, use it there, and add the single fetch:

```ts
const OFFICIAL_INCIDENT_COLUMNS =
  "id, wilaya_id, commune_id, kind, status, precision, authority_tier, place_text, first_reported_at, last_reported_at, as_of, updated_at, unlisted_at, mention_count, evidence, commune:admin_units!official_incidents_commune_id_fkey(name_ar, name_fr, name_en, name_kab, lat, lon), wilaya:admin_units!official_incidents_wilaya_id_fkey(name_ar, name_fr, name_en, name_kab, lat, lon), latest_mention:incident_mentions!official_incidents_latest_mention_fkey(document:source_documents(url, published_at), source:text_sources(label))";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function fetchOfficialIncident(
  client: typeof supabase,
  id: string,
): Promise<OfficialIncident | null> {
  // a malformed id is a 22P02 from Postgres, which would surface as a 500
  if (!UUID.test(id)) return null;
  const { data, error } = await client
    .from("official_incidents")
    .select(OFFICIAL_INCIDENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as unknown as OfficialIncident | null;
}
```

- [ ] **Step 4: Write `src/lib/share-card.ts`**

```ts
import { LOCALES, type Locale } from "@/i18n/locales-list";
import { intlLocale, unitName, type OfficialIncident } from "@/lib/nadhir";
import { isFireKind } from "@/lib/text-sources/merge";

export const SITE_URL = "https://nadhir.app";

export const SHARE_FORMATS = {
  story: { width: 1080, height: 1920, type: "png" },
  post: { width: 1080, height: 1350, type: "png" },
  sticker: { width: 960, height: 600, type: "png" },
  og: { width: 1200, height: 630, type: "jpeg" },
} as const;
export type ShareFormat = keyof typeof SHARE_FORMATS;

export const isShareFormat = (value: string): value is ShareFormat =>
  Object.hasOwn(SHARE_FORMATS, value);

export const shareLocale = (value: string | null | undefined): Locale =>
  (LOCALES as readonly string[]).includes(value ?? "") ? (value as Locale) : "ar";

export const HAZARD_NAME: Record<string, string> = {
  flood: "flooding",
  road: "road_blocked",
  structure: "structural",
  storm: "storm_damage",
  other: "other",
};

export const isShareable = (incident: Pick<OfficialIncident, "authority_tier">) =>
  incident.authority_tier !== "media";

type T = (key: string, vars?: Record<string, string>) => string;

export type IncidentCard = {
  fire: boolean;
  eyebrow: string;
  source: string;
  hazard: string;
  status: string;
  place: string;
  region: string;
  placeText: string | null;
  time: string;
};

export function algiersDateTime(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: "Africa/Algiers",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function incidentCardModel(
  incident: OfficialIncident,
  t: T,
  locale: Locale,
): IncidentCard {
  const fire = isFireKind(incident.kind);
  const commune = incident.precision === "wilaya" ? null : incident.commune;
  return {
    fire,
    eyebrow: t("official.eyebrow"),
    source:
      incident.latest_mention?.source?.label ?? t("official.sourceFallback"),
    hazard: fire
      ? t("civilMap.fire")
      : t(`reports.hazardName.${HAZARD_NAME[incident.kind] ?? "other"}`),
    status: t(`official.statuses.${incident.status}`),
    place: unitName(commune ?? incident.wilaya, locale),
    region: commune
      ? t("official.inWilaya", { wilaya: unitName(incident.wilaya, locale) })
      : t("official.wilayaLevel"),
    placeText: incident.place_text,
    time: t("shareCard.asOf", { time: algiersDateTime(incident.as_of, locale) }),
  };
}

export const shareImagePath = (
  id: string,
  format: ShareFormat,
  lang: Locale,
  updatedAt: string,
) =>
  `/api/public/share/incident/${id}/${format}?lang=${lang}&v=${Date.parse(updatedAt)}`;

export const shareCardPath = (id: string, format: ShareFormat, lang: Locale) =>
  `/share-card/incident/${id}?format=${format}&lang=${lang}`;

export const incidentUrl = (origin: string, id: string, lang: Locale) =>
  `${origin}/incident/${id}?lang=${lang}`;

export const linkTargets = (url: string) => ({
  whatsapp: `https://wa.me/?text=${encodeURIComponent(url)}`,
  facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
});
```

- [ ] **Step 5: Point `OfficialIncidentDetail` at the shared `HAZARD_NAME`**

Delete the local `HAZARD_NAME` constant in `src/components/nadhir/OfficialIncidentDetail.tsx` and add `import { HAZARD_NAME } from "@/lib/share-card";`.

- [ ] **Step 6: Add the `shareCard` strings**

Add a top-level `shareCard` block after `official` in each locale (kab carries the French text, as the rest of kab does until reviewed):

en:
```ts
  shareCard: {
    open: "Share",
    title: "Share this report",
    formats: { story: "Story", post: "Post", sticker: "Sticker" },
    image: "Image",
    link: "Link",
    shareImage: "Share image",
    save: "Save",
    copySticker: "Copy sticker",
    stickerCopied: "Sticker copied. Open your Instagram story and paste it.",
    copyLink: "Copy link",
    linkCopied: "Link copied",
    failed: "Could not share. Use Save instead.",
    cardError: "Image unavailable",
    retry: "Retry",
    seeOnMap: "See on the map",
    asOf: "As of {{time}}",
    metaTitle: "{{hazard}} · {{place}} · Nadhir",
  },
```
fr / kab:
```ts
  shareCard: {
    open: "Partager",
    title: "Partager ce signalement",
    formats: { story: "Story", post: "Publication", sticker: "Sticker" },
    image: "Image",
    link: "Lien",
    shareImage: "Partager l’image",
    save: "Enregistrer",
    copySticker: "Copier le sticker",
    stickerCopied: "Sticker copié. Ouvrez votre story Instagram et collez-le.",
    copyLink: "Copier le lien",
    linkCopied: "Lien copié",
    failed: "Partage impossible. Utilisez Enregistrer.",
    cardError: "Image indisponible",
    retry: "Réessayer",
    seeOnMap: "Voir sur la carte",
    asOf: "Au {{time}}",
    metaTitle: "{{hazard}} · {{place}} · Nadhir",
  },
```
ar:
```ts
  shareCard: {
    open: "مشاركة",
    title: "مشاركة هذا البلاغ",
    formats: { story: "قصة", post: "منشور", sticker: "ملصق" },
    image: "صورة",
    link: "رابط",
    shareImage: "مشاركة الصورة",
    save: "حفظ",
    copySticker: "نسخ الملصق",
    stickerCopied: "تم نسخ الملصق. افتح قصتك على إنستغرام والصقه.",
    copyLink: "نسخ الرابط",
    linkCopied: "تم نسخ الرابط",
    failed: "تعذّرت المشاركة. استعمل الحفظ.",
    cardError: "الصورة غير متاحة",
    retry: "إعادة المحاولة",
    seeOnMap: "عرض على الخريطة",
    asOf: "بتاريخ {{time}}",
    metaTitle: "{{hazard}} · {{place}} · نذير",
  },
```

- [ ] **Step 7: Correct the spec** — in `docs/superpowers/specs/2026-09-27-incident-share-cards.md`: cache key and `v` use `updated_at` (not `as_of`); card languages are ar/fr/en (kab withheld); the carousel preloads all three images on open (thumbnails are visible together); device test runs on a `wrangler versions upload` preview, CI has no PR previews; sticker viewport 960×600.

- [ ] **Step 8: Run the gates**

Run: `bun run test src/lib/__tests__/share-card.test.ts src/lib/__tests__/i18n.test.ts && bunx tsc --noEmit && bun run lint`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A src/lib src/components/nadhir/OfficialIncidentDetail.tsx src/i18n docs/superpowers
git commit -m "Add the incident share card model, single incident fetch and strings"
```

---

### Task 2: Card template route

**Files:**
- Modify: `src/lib/share-card.ts` (add `outlinePaths`)
- Modify: `src/lib/__tests__/share-card.test.ts`
- Create: `src/components/share/IncidentCard.tsx`
- Create: `src/routes/share-card.incident.$id.tsx`
- Modify: `src/routes/__root.tsx` (no chrome under `/share-card/`)

**Interfaces:**
- Consumes: Task 1 exports; `communeGeomsQuery(ids)` from `nadhir.ts` (browser-only, returns `Map<string, Geometry>`).
- Produces: route `/share-card/incident/$id?format=&lang=` whose root element carries `data-card-ready` or `data-card-error`.

- [ ] **Step 1: Failing test for `outlinePaths`** (append to the test file)

```ts
import { outlinePaths } from "@/lib/share-card";

describe("outlinePaths", () => {
  const square = (x: number, y: number, s: number) => ({
    type: "Polygon" as const,
    coordinates: [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]],
  });

  it("fits every shape inside the padded box, one path per shape", () => {
    const paths = outlinePaths([square(4, 36, 1), square(4.2, 36.2, 0.2)], 400, 400, 20);
    expect(paths).toHaveLength(2);
    const numbers = paths.join(" ").match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(20);
    expect(Math.max(...numbers)).toBeLessThanOrEqual(380);
  });

  it("draws north up", () => {
    const [path] = outlinePaths([square(4, 36, 1)], 400, 400, 0);
    const [, firstY] = path!.match(/M(-?[\d.]+) (-?[\d.]+)/)!.slice(1).map(Number);
    expect(firstY).toBeGreaterThan(200);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test src/lib/__tests__/share-card.test.ts`
Expected: FAIL, `outlinePaths` is not exported.

- [ ] **Step 3: Implement `outlinePaths`** in `src/lib/share-card.ts` (add `import type { Geometry, Position } from "geojson";` at the top)

```ts
const rings = (geometry: Geometry): Position[][] =>
  geometry.type === "Polygon"
    ? geometry.coordinates
    : geometry.type === "MultiPolygon"
      ? geometry.coordinates.flat()
      : [];

export function outlinePaths(
  shapes: Geometry[],
  width: number,
  height: number,
  pad: number,
): string[] {
  const points = shapes.flatMap(rings).flat();
  if (!points.length) return [];
  const lons = points.map(([lon]) => lon!);
  const lats = points.map(([, lat]) => lat!);
  const [minLon, maxLon] = [Math.min(...lons), Math.max(...lons)];
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLon - minLon) * kx, 1e-9);
  const spanY = Math.max(maxLat - minLat, 1e-9);
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;
  const xy = ([lon, lat]: Position) =>
    `${((lon! - minLon) * kx * scale + offX).toFixed(1)} ${((maxLat - lat!) * scale + offY).toFixed(1)}`;
  return shapes.map((shape) =>
    rings(shape)
      .map((ring) => `M${ring.map(xy).join("L")}Z`)
      .join(""),
  );
}
```

- [ ] **Step 4: Run the test** — `bun run test src/lib/__tests__/share-card.test.ts`, expected PASS.

- [ ] **Step 5: Write `src/components/share/IncidentCard.tsx`**

```tsx
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CloudLightning,
  Flame,
  TrafficCone,
  TriangleAlert,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import i18n from "@/i18n";
import type { Locale } from "@/i18n/locales-list";
import { communeGeomsQuery, type OfficialIncident } from "@/lib/nadhir";
import {
  SHARE_FORMATS,
  incidentCardModel,
  outlinePaths,
  type ShareFormat,
} from "@/lib/share-card";
import { isFireKind } from "@/lib/text-sources/merge";

const ICON: Record<string, LucideIcon> = {
  flood: Waves,
  road: TrafficCone,
  structure: Building2,
  storm: CloudLightning,
  other: TriangleAlert,
};
const ACCENT: Record<string, string> = {
  fire: "#f97316",
  flood: "#38bdf8",
  road: "#f59e0b",
  structure: "#e879f9",
  storm: "#a78bfa",
  other: "#a3a3a3",
};

type Props = { incident: OfficialIncident; format: ShareFormat; lang: Locale };

export function IncidentCard({ incident, format, lang }: Props) {
  const t = i18n.getFixedT(lang);
  const card = incidentCardModel(incident, t, lang);
  const key = isFireKind(incident.kind) ? "fire" : incident.kind;
  const Icon = key === "fire" ? Flame : (ICON[key] ?? TriangleAlert);
  const accent = ACCENT[key] ?? ACCENT["other"]!;
  const wilayaOnly = incident.precision === "wilaya" || !incident.commune_id;
  const ids = wilayaOnly
    ? [incident.wilaya_id]
    : [incident.wilaya_id, incident.commune_id!];
  const geoms = useQuery({ ...communeGeomsQuery(ids), enabled: format !== "sticker" && typeof window !== "undefined" });
  const [fonts, setFonts] = useState(false);
  useEffect(() => {
    void document.fonts.ready.then(() => setFonts(true));
  }, []);
  const needsMap = format !== "sticker";
  const ready = fonts && (!needsMap || geoms.isSuccess);
  const size = SHARE_FORMATS[format];
  const rtl = lang === "ar";

  const map = (box: number) => {
    const shapes = ids.flatMap((id) => {
      const g = geoms.data?.get(id);
      return g ? [g] : [];
    });
    const [outer, inner] = outlinePaths(shapes, box, box, box * 0.06);
    return (
      <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden>
        {outer ? (
          <path
            d={outer}
            fill={wilayaOnly ? `${accent}55` : "none"}
            stroke={wilayaOnly ? accent : "#f5efe655"}
            strokeWidth={4}
            strokeLinejoin="round"
          />
        ) : null}
        {inner ? (
          <path d={inner} fill={`${accent}66`} stroke={accent} strokeWidth={6} strokeLinejoin="round" />
        ) : null}
      </svg>
    );
  };

  const text = (
    <>
      <p style={{ fontSize: "1em", opacity: 0.75 }}>
        {card.eyebrow} · {card.source}
      </p>
      <p style={{ fontSize: "2.6em", fontWeight: 600, lineHeight: 1.1, marginTop: "0.4em" }}>
        <Icon style={{ display: "inline", width: "0.9em", height: "0.9em", color: accent, marginInlineEnd: "0.25em", verticalAlign: "-0.1em" }} />
        {card.hazard}
      </p>
      <p style={{ fontSize: "1.5em", color: accent, fontWeight: 600 }}>{card.status}</p>
      <p style={{ fontSize: "1.8em", fontWeight: 600, marginTop: "0.6em" }}>{card.place}</p>
      <p style={{ fontSize: "1.1em", opacity: 0.75 }}>
        {card.region}
        {card.placeText ? ` · ${card.placeText}` : null}
      </p>
      <p style={{ fontSize: "1.1em", marginTop: "0.6em" }}>{card.time}</p>
    </>
  );
  const brand = <p style={{ fontSize: "1.1em", fontWeight: 600, letterSpacing: "0.02em" }}>nadhir.app</p>;

  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      lang={lang}
      data-card-ready={ready ? "" : undefined}
      data-card-error={geoms.isError ? "" : undefined}
      style={{
        width: size.width,
        height: size.height,
        fontFamily: rtl ? "var(--font-arabic)" : "var(--font-sans)",
        color: "#f5efe6",
        background: format === "sticker" ? "transparent" : "#14110f",
        overflow: "hidden",
      }}
    >
      {format === "sticker" ? <style>{"html,body{background:transparent!important}"}</style> : null}
      {format === "story" ? (
        <div style={{ fontSize: 36, padding: "220px 96px", height: "100%", display: "flex", flexDirection: "column" }}>
          {text}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>{map(760)}</div>
          {brand}
        </div>
      ) : format === "post" ? (
        <div style={{ fontSize: 30, padding: 80, height: "100%", display: "flex", flexDirection: "column" }}>
          {text}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>{map(520)}</div>
          {brand}
        </div>
      ) : format === "og" ? (
        <div style={{ fontSize: 26, padding: 56, height: "100%", display: "flex", gap: 40, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            {text}
            <div style={{ marginTop: "1em" }}>{brand}</div>
          </div>
          {map(480)}
        </div>
      ) : (
        <div style={{ fontSize: 30, padding: 56, height: "100%", borderRadius: 48, background: "#14110ff2" }}>
          {text}
          <div style={{ marginTop: "0.8em" }}>{brand}</div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Write `src/routes/share-card.incident.$id.tsx`**

```tsx
import { createFileRoute, notFound } from "@tanstack/react-router";

import { IncidentCard } from "@/components/share/IncidentCard";
import { supabase } from "@/integrations/supabase/client";
import { fetchOfficialIncident } from "@/lib/nadhir";
import { isShareFormat, isShareable, shareLocale, type ShareFormat } from "@/lib/share-card";

export const Route = createFileRoute("/share-card/incident/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    format: (typeof search["format"] === "string" && isShareFormat(search["format"])
      ? search["format"]
      : "story") as ShareFormat,
    lang: shareLocale(typeof search["lang"] === "string" ? search["lang"] : null),
  }),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: async ({ params }) => {
    const incident = await fetchOfficialIncident(supabase, params.id);
    if (!incident || !isShareable(incident)) throw notFound();
    return incident;
  },
  component: Page,
});

function Page() {
  const incident = Route.useLoaderData();
  const { format, lang } = Route.useSearch();
  return <IncidentCard incident={incident} format={format} lang={lang} />;
}
```

- [ ] **Step 7: Render card routes without site chrome** in `RootComponent` (`src/routes/__root.tsx`): add after the `liveMap` hook

```tsx
  // share cards are screenshotted: nothing but the card may paint
  const bare = useRouterState({
    select: (s) => s.location.pathname.startsWith("/share-card/"),
  });
```

and, after the last `useEffect`, before the existing `return`:

```tsx
  if (bare)
    return (
      <I18nextProvider i18n={i18nInstance}>
        <QueryClientProvider client={queryClient}>
          <Outlet />
        </QueryClientProvider>
      </I18nextProvider>
    );
```

- [ ] **Step 8: Look at every format** — `bun run dev`, then with Playwright MCP open `http://localhost:8080/share-card/incident/<id>?format=<f>&lang=<l>` for a real non-media incident id (`select id from official_incidents where authority_tier <> 'media' order by last_reported_at desc limit 1` via the anon REST API), viewport = format size, for story/post/sticker/og × ar/fr/en. Check: Arabic letters joined and right-to-left, nothing clipped, `data-card-ready` appears, no header/footer. Fix layout until all 12 pass.

- [ ] **Step 9: Gates and commit**

Run: `bunx tsc --noEmit && bun run test && bun run lint`
```bash
git add -A src/lib src/components/share src/routes
git commit -m "Add the chrome-free incident share card route for every format"
```

---

### Task 3: Image endpoint on Browser Run

**Files:**
- Create: `src/lib/share-render.server.ts`
- Test: `src/lib/__tests__/share-render.test.ts`
- Create: `src/routes/api/public/share/incident.$id.$format.ts`
- Create: `src/cloudflare-workers.d.ts`
- Modify: `vite.config.ts` (browser binding), `package.json` (`@cloudflare/puppeteer`)

**Interfaces:**
- Consumes: `fetchOfficialIncident`, `isShareFormat`, `isShareable`, `shareLocale`, `shareCardPath`, `SHARE_FORMATS`.
- Produces: `GET /api/public/share/incident/:id/:format?lang=&v=` → image; `handleShareImage(input, deps)`.

- [ ] **Step 1: Failing tests** — `src/lib/__tests__/share-render.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";

import type { OfficialIncident } from "@/lib/nadhir";
import { handleShareImage, type ShareDeps } from "@/lib/share-render.server";

const updated = "2026-09-27T13:40:00Z";
const version = String(Date.parse(updated));
const incident = { id: "i1", authority_tier: "national", updated_at: updated } as OfficialIncident;

function deps(over: Partial<ShareDeps> = {}) {
  const store = new Map<string, Response>();
  const cache = {
    match: async (key: Request) => store.get(key.url)?.clone(),
    put: async (key: Request, res: Response) => void store.set(key.url, res),
  };
  const d: ShareDeps = {
    load: async () => incident,
    screenshot: vi.fn(async () => new Uint8Array([1, 2, 3])),
    cache,
    limit: async () => null,
    ...over,
  };
  return { d, store };
}
const input = (over = {}) => ({
  id: "i1",
  format: "story",
  lang: "fr",
  v: version,
  origin: "https://nadhir.app",
  ...over,
});

describe("handleShareImage", () => {
  it("rejects unknown formats and non-shareable incidents", async () => {
    expect((await handleShareImage(input({ format: "gif" }), deps().d)).status).toBe(400);
    expect((await handleShareImage(input(), deps({ load: async () => null }).d)).status).toBe(404);
    const media = { ...incident, authority_tier: "media" } as OfficialIncident;
    expect((await handleShareImage(input(), deps({ load: async () => media }).d)).status).toBe(404);
  });

  it("renders the card route once, then serves the cached image", async () => {
    const { d } = deps();
    const first = await handleShareImage(input(), d);
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("image/png");
    expect(first.headers.get("cache-control")).toContain("immutable");
    expect(d.screenshot).toHaveBeenCalledWith(
      "https://nadhir.app/share-card/incident/i1?format=story&lang=fr",
      "story",
    );
    const second = await handleShareImage(input(), d);
    expect(second.status).toBe(200);
    expect(d.screenshot).toHaveBeenCalledTimes(1);
  });

  it("keys the cache on the real version, not the caller's", async () => {
    const { d } = deps();
    const stale = await handleShareImage(input({ v: "1" }), d);
    expect(stale.headers.get("cache-control")).toBe("public, max-age=60");
    await handleShareImage(input(), d);
    expect(d.screenshot).toHaveBeenCalledTimes(1);
  });

  it("answers 503 and caches nothing when the browser fails", async () => {
    const { d, store } = deps({
      screenshot: async () => {
        throw new Error("timeout");
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handleShareImage(input(), d);
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(store.size).toBe(0);
  });

  it("answers 501 where no browser is bound", async () => {
    expect((await handleShareImage(input(), deps({ screenshot: null }).d)).status).toBe(501);
  });

  it("serves og as JPEG", async () => {
    const res = await handleShareImage(input({ format: "og" }), deps().d);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `bun run test src/lib/__tests__/share-render.test.ts`, expected FAIL (module missing).

- [ ] **Step 3: Install the dependency** — `bun add @cloudflare/puppeteer`

- [ ] **Step 4: Declare the Workers module** — `src/cloudflare-workers.d.ts`

```ts
declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
```

- [ ] **Step 5: Write `src/lib/share-render.server.ts`**

```ts
import type { OfficialIncident } from "@/lib/nadhir";
import {
  SHARE_FORMATS,
  isShareFormat,
  isShareable,
  shareCardPath,
  shareLocale,
  type ShareFormat,
} from "@/lib/share-card";

export type Screenshotter = (url: string, format: ShareFormat) => Promise<Uint8Array>;
type CacheLike = Pick<Cache, "match" | "put">;

export type ShareDeps = {
  load: (id: string) => Promise<OfficialIncident | null>;
  screenshot: Screenshotter | null;
  cache: CacheLike | null;
  limit: () => Promise<Response | null>;
};

type Input = { id: string; format: string; lang: string | null; v: string | null; origin: string };

const IMMUTABLE = "public, max-age=31536000, immutable";

export async function handleShareImage(input: Input, deps: ShareDeps) {
  if (!isShareFormat(input.format)) return new Response("unknown format", { status: 400 });
  const format = input.format;
  const incident = await deps.load(input.id);
  if (!incident || !isShareable(incident)) return new Response("not found", { status: 404 });
  const lang = shareLocale(input.lang);
  const version = String(Date.parse(incident.updated_at));
  const type = SHARE_FORMATS[format].type === "jpeg" ? "image/jpeg" : "image/png";
  const headers = {
    "content-type": type,
    "cache-control": input.v === version ? IMMUTABLE : "public, max-age=60",
  };
  const key = new Request(`${input.origin}/__share/${incident.id}/${format}/${lang}/${version}`);
  const hit = await deps.cache?.match(key);
  if (hit) return new Response(hit.body, { headers });
  if (!deps.screenshot) return new Response("browser rendering unavailable here", { status: 501 });
  const limited = await deps.limit();
  if (limited) return limited;
  let image: Uint8Array;
  try {
    image = await deps.screenshot(`${input.origin}${shareCardPath(incident.id, format, lang)}`, format);
  } catch (failure) {
    console.error("share card render failed", incident.id, format, failure);
    return new Response("render failed", { status: 503, headers: { "retry-after": "30" } });
  }
  await deps.cache?.put(key, new Response(image, { headers: { "content-type": type, "cache-control": IMMUTABLE } }));
  return new Response(image, { headers });
}

export async function browserScreenshotter(): Promise<Screenshotter | null> {
  let binding: unknown;
  try {
    binding = (await import("cloudflare:workers")).env["BROWSER"];
  } catch {
    return null;
  }
  if (!binding) return null;
  const { default: puppeteer } = await import("@cloudflare/puppeteer");
  return async (url, format) => {
    const { width, height, type } = SHARE_FORMATS[format];
    const browser = await puppeteer.launch(binding as Parameters<typeof puppeteer.launch>[0]);
    try {
      const page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.goto(url, { waitUntil: "networkidle0", timeout: 15_000 });
      const card = await page.waitForSelector("[data-card-ready],[data-card-error]", { timeout: 15_000 });
      if (await card?.evaluate((el) => el.hasAttribute("data-card-error")))
        throw new Error("card reported an error");
      return (await page.screenshot(
        type === "jpeg"
          ? { type: "jpeg", quality: 80 }
          : { type: "png", omitBackground: format === "sticker" },
      )) as Uint8Array;
    } finally {
      await browser.close();
    }
  };
}
```

- [ ] **Step 6: Run the tests** — `bun run test src/lib/__tests__/share-render.test.ts`, expected PASS.

- [ ] **Step 7: Write the route** — `src/routes/api/public/share/incident.$id.$format.ts`

```ts
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/share/incident/$id/$format")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const [{ handleShareImage, browserScreenshotter }, { publicSupabase, enforceRateLimit }, { fetchOfficialIncident }] =
          await Promise.all([
            import("@/lib/share-render.server"),
            import("@/lib/public-api.server"),
            import("@/lib/nadhir"),
          ]);
        const url = new URL(request.url);
        return handleShareImage(
          {
            id: params.id,
            format: params.format,
            lang: url.searchParams.get("lang"),
            v: url.searchParams.get("v"),
            origin: url.origin,
          },
          {
            load: (id) => fetchOfficialIncident(publicSupabase(), id),
            screenshot: await browserScreenshotter(),
            cache: typeof caches === "undefined" ? null : (caches as unknown as { default: Cache }).default,
            limit: () => enforceRateLimit(request),
          },
        );
      },
    },
  },
});
```

If `publicSupabase()`'s type differs from `typeof supabase`, widen `fetchOfficialIncident`'s `client` parameter to `SupabaseClient<Database>` (from `@supabase/supabase-js` and `@/integrations/supabase/types`).

- [ ] **Step 8: Bind Browser Run** — in `vite.config.ts`, inside `cloudflare.wrangler`, add `browser: { binding: "BROWSER" },` after `placement`.

- [ ] **Step 9: Prove dev and build behave**

Run: `bun run dev`, then `curl -s -o /dev/null -w "%{http_code}\n" localhost:8080/api/public/share/incident/<id>/story` → expected `501`; `…/<id>/gif` → `400`; `…/not-a-uuid/story` → `404`.
Run: `bun run build && grep -l "cloudflare:workers" .output/server -r | head -3 && grep -n "BROWSER" .output/server/wrangler.json` → the import survives as external and the binding is in the generated config.

- [ ] **Step 10: Gates and commit**

Run: `bunx tsc --noEmit && bun run test && bun run lint`
```bash
git add -A src/lib src/routes/api src/cloudflare-workers.d.ts vite.config.ts package.json bun.lock
git commit -m "Render share cards to images with Browser Run, cached per incident version"
```

---

### Task 4: Landing page, link preview and share sheet

**Files:**
- Create: `src/routes/incident.$id.tsx`
- Create: `src/components/share/IncidentShareSheet.tsx`
- Modify: `src/components/nadhir/OfficialIncidentDetail.tsx` (share button)

**Interfaces:**
- Consumes: Task 1 helpers, `ui/sheet.tsx` (`Sheet`, `SheetTrigger`, `SheetContent`, `SheetHeader`, `SheetTitle`), `sonner` `toast`.
- Produces: `/incident/$id`; `<IncidentShareSheet incident={…} />`.

- [ ] **Step 1: Write `src/components/share/IncidentShareSheet.tsx`**

```tsx
import { Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { shareLocale } from "@/lib/share-card";
import type { OfficialIncident } from "@/lib/nadhir";
import { SHARE_FORMATS, incidentUrl, linkTargets, shareImagePath, type ShareFormat } from "@/lib/share-card";
import { cn } from "@/lib/utils";

const CARDS = ["story", "post", "sticker"] as const satisfies readonly ShareFormat[];
type Loaded = { file: File; url: string } | "error" | undefined;

export function IncidentShareSheet({ incident }: { incident: OfficialIncident }) {
  const { t, i18n } = useTranslation();
  const lang = shareLocale(i18n.language);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<(typeof CARDS)[number]>("story");
  const [images, setImages] = useState<Partial<Record<ShareFormat, Loaded>>>({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    const urls: string[] = [];
    let live = true;
    for (const format of CARDS) {
      void fetch(shareImagePath(incident.id, format, lang, incident.updated_at))
        .then(async (res) => {
          if (!res.ok) throw new Error(`${res.status}`);
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          urls.push(url);
          const file = new File([blob], `nadhir-${format}.png`, { type: blob.type });
          if (live) setImages((prev) => ({ ...prev, [format]: { file, url } }));
        })
        .catch(() => live && setImages((prev) => ({ ...prev, [format]: "error" })));
    }
    return () => {
      live = false;
      urls.forEach(URL.revokeObjectURL);
      setImages({});
    };
  }, [open, attempt, incident.id, incident.updated_at, lang]);

  const link = incidentUrl(window.location.origin, incident.id, lang);
  const targets = linkTargets(link);
  const current = images[active];
  const file = current && current !== "error" ? current.file : null;
  const canShareFiles = !!file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });

  const shareImage = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file] });
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === "AbortError") return;
      toast.error(t("shareCard.failed"));
    }
  };
  const save = () => {
    if (!current || current === "error") return;
    const a = document.createElement("a");
    a.href = current.url;
    a.download = current.file.name;
    a.click();
  };
  const copySticker = async () => {
    if (!file) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": Promise.resolve(file) })]);
      toast.success(t("shareCard.stickerCopied"));
    } catch {
      toast.error(t("shareCard.failed"));
    }
  };
  const copyLink = async () => {
    await navigator.clipboard.writeText(link);
    toast.success(t("shareCard.linkCopied"));
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Share2 aria-hidden />
          {t("shareCard.open")}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("shareCard.title")}</SheetTitle>
        </SheetHeader>
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
          {CARDS.map((format) => {
            const image = images[format];
            const { width, height } = SHARE_FORMATS[format];
            return (
              <button
                key={format}
                type="button"
                onClick={() => setActive(format)}
                aria-pressed={active === format}
                className={cn(
                  "flex shrink-0 snap-center flex-col items-center gap-2 rounded-xl p-2",
                  active === format ? "ring-2 ring-primary" : "opacity-70",
                )}
              >
                <span
                  className="flex h-56 items-center justify-center overflow-hidden rounded-lg bg-muted"
                  style={{ aspectRatio: `${width} / ${height}` }}
                >
                  {image === "error" ? (
                    <span className="p-2 text-center text-xs">{t("shareCard.cardError")}</span>
                  ) : image ? (
                    <img src={image.url} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <span className="h-full w-full animate-pulse bg-muted-foreground/10" />
                  )}
                </span>
                <span className="text-sm">{t(`shareCard.formats.${format}`)}</span>
              </button>
            );
          })}
        </div>
        <div className="space-y-3 px-4 pb-6">
          {current === "error" ? (
            <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
              {t("shareCard.retry")}
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">{t("shareCard.image")}</p>
          <div className="flex flex-wrap gap-2">
            {active === "sticker" ? (
              <Button disabled={!file} onClick={() => void copySticker()}>
                {t("shareCard.copySticker")}
              </Button>
            ) : canShareFiles ? (
              <Button onClick={() => void shareImage()}>{t("shareCard.shareImage")}</Button>
            ) : null}
            <Button variant={canShareFiles || active === "sticker" ? "outline" : "default"} disabled={!file} onClick={save}>
              {t("shareCard.save")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("shareCard.link")}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href={targets.whatsapp} target="_blank" rel="noreferrer noopener">WhatsApp</a>
            </Button>
            <Button variant="outline" asChild>
              <a href={targets.facebook} target="_blank" rel="noreferrer noopener">Facebook</a>
            </Button>
            <Button variant="outline" onClick={() => void copyLink()}>
              {t("shareCard.copyLink")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

(Merge the two `@/lib/share-card` imports into one when writing the file.)

- [ ] **Step 2: Add the button to `OfficialIncidentDetail`** — import `IncidentShareSheet` and `isShareable`, and render after the "view the original post" link:

```tsx
      {isShareable(incident) ? <IncidentShareSheet incident={incident} /> : null}
```

- [ ] **Step 3: Write `src/routes/incident.$id.tsx`**

```tsx
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { OfficialIncidentDetail } from "@/components/nadhir/OfficialIncidentDetail";
import i18n, { isLocale, readLocaleCookie } from "@/i18n";
import type { Locale } from "@/i18n/locales-list";
import { supabase } from "@/integrations/supabase/client";
import { fetchOfficialIncident } from "@/lib/nadhir";
import { SITE_URL, incidentCardModel, isShareable, shareImagePath } from "@/lib/share-card";

export const Route = createFileRoute("/incident/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    lang: typeof search["lang"] === "string" && isLocale(search["lang"]) ? search["lang"] : undefined,
  }),
  loader: async ({ params }) => {
    const incident = await fetchOfficialIncident(supabase, params.id);
    if (!incident || !isShareable(incident)) throw notFound();
    return incident;
  },
  head: ({ loaderData, match }) => {
    if (!loaderData) return {};
    const lang: Locale = match.search.lang ?? readLocaleCookie();
    const t = i18n.getFixedT(lang);
    const card = incidentCardModel(loaderData, t, lang);
    const title = t("shareCard.metaTitle", { hazard: card.hazard, place: card.place });
    const description = `${card.eyebrow} · ${card.source} · ${card.status} · ${card.time}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:image", content: `${SITE_URL}${shareImagePath(loaderData.id, "og", lang, loaderData.updated_at)}` },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: Page,
});

function Page() {
  const incident = Route.useLoaderData();
  const { t, i18n: instance } = useTranslation();
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <OfficialIncidentDetail incident={incident} locale={instance.language as Locale} now={Date.now()} />
      <Link to="/" search={{ event: `official:${incident.id}` }} className="text-sm font-medium text-primary underline">
        {t("shareCard.seeOnMap")}
      </Link>
    </div>
  );
}
```

If `match.search` is not typed with `lang` in `head`, read it through `Route.useSearch`'s type: `(match.search as { lang?: Locale }).lang`.

- [ ] **Step 4: Verify in the browser** — `bun run dev`; with Playwright open `/incident/<id>?lang=fr`: detail renders, `og:image` meta present and absolute, "See on the map" opens the incident on the map, the share button opens the sheet with three skeleton thumbnails that become "Image unavailable" in dev (the endpoint is 501 there), Retry re-fetches, WhatsApp/Facebook links are well-formed, Copy link toasts. `/incident/not-a-uuid` → 404 page. Check the map panel shows the same button.

- [ ] **Step 5: Gates and commit**

Run: `bunx tsc --noEmit && bun run test && bun run lint`
```bash
git add -A src/routes src/components
git commit -m "Add the incident landing page with link preview and the share sheet"
```

---

### Task 5: Preview version, device test, sticker decision, PR

Owner-gated: uploading a Worker version and opening a PR are outward actions. Ask before each.

- [ ] **Step 1: Upload a preview version (after OK)** — `bun run build && bunx wrangler versions upload --config .output/server/wrangler.json` (adjust the path to where nitro writes the config). It does not route production traffic. Note the preview URL it prints; if preview URLs are disabled for the Worker, stop and report.
- [ ] **Step 2: Measure** — `curl -w "%{time_total}\n" -o /tmp/s.png "<preview>/api/public/share/incident/<id>/story?lang=ar"` twice: first render time, then cache hit time. Open all four formats in ar/fr/en and look at them.
- [ ] **Step 3: Device matrix (owner, on phones)** — iPhone Safari and Android Chrome, on `<preview>/incident/<id>`: Share image → Instagram Story, Facebook Story, WhatsApp; Save; Copy sticker → paste into an Instagram story over a photo (keeps transparency: yes/no); WhatsApp and Facebook link buttons.
- [ ] **Step 4: Sticker decision** — if the paste loses transparency on both phones, delete `sticker` from `CARDS`, `SHARE_FORMATS`, the card layout, the strings and the tests in this branch; otherwise keep it.
- [ ] **Step 5: Whole-branch review** — one combined spec+quality review over `git diff origin/main...HEAD`.
- [ ] **Step 6: Open the PR (after OK)** — push the branch and open a PR; do not merge. After merge and deploy, run the prod link through Facebook's Sharing Debugger.
