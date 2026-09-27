import type { Geometry, Position } from "geojson";

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
  (LOCALES as readonly string[]).includes(value ?? "")
    ? (value as Locale)
    : "ar";

export const HAZARD_NAME: Record<string, string> = {
  flood: "flooding",
  road: "road_blocked",
  structure: "structural",
  storm: "storm_damage",
  other: "other",
};

export const isShareable = (
  incident: Pick<OfficialIncident, "authority_tier">,
) => incident.authority_tier !== "media";

export type T = (key: string, vars?: Record<string, string>) => string;

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
    time: t("shareCard.asOf", {
      time: algiersDateTime(incident.as_of, locale),
    }),
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
