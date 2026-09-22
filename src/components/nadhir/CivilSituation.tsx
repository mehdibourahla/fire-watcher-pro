import {
  CloudLightning,
  Flame,
  ShieldCheck,
  TriangleAlert,
  Route as Road,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { Locale } from "@/i18n";
import type { Situation } from "@/lib/civil-map";
import { relativeTime, unitName, type AdminUnit } from "@/lib/nadhir";
import { OfficialIncidentDetail } from "./OfficialIncidentDetail";
import { HazardReportDetail } from "./HazardReportDetail";
import { civilPublicationLifecycle } from "@/lib/civil-publication";

export const hazardIcons = {
  all: ShieldCheck,
  fire: Flame,
  weather: CloudLightning,
  road: Road,
  other: TriangleAlert,
};

export function useSituationLabels(units: AdminUnit[], now: number) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const place = (item: Situation) => {
    const unit = units.find((u) => u.id === (item.areaId ?? item.wilayaId));
    if (unit) return unitName(unit, locale);
    if (item.source === "onm")
      return item.data.area_desc || t("civilMap.unknownLocation");
    if (item.source === "official")
      return unitName(item.data.commune ?? item.data.wilaya, locale);
    if (item.source === "civil" && item.data.area)
      return unitName(item.data.area, locale);
    return item.lat !== null && item.lon !== null
      ? `${item.lat.toFixed(3)}, ${item.lon.toFixed(3)}`
      : t("civilMap.unknownLocation");
  };
  const title = (item: Situation) =>
    item.source === "civil"
      ? item.data.summary
      : item.source === "onm"
        ? item.data.headline_fr || item.data.title
        : item.source === "satellite" && item.level === "heat_signal"
          ? `${t("civilMap.heatSignalShort")} · ${place(item)}`
          : `${t(`civilMap.${item.category}`)} · ${place(item)}`;
  const source = (item: Situation) =>
    t(
      item.source === "official" && item.data.authority_tier === "media"
        ? "civilMap.sourceMedia"
        : (
            {
              satellite: "civilMap.sourceSatellite",
              official: "civilMap.sourceOfficial",
              citizen: "civilMap.sourceCitizen",
              onm: "civilMap.sourceOnm",
              civil: "civilMap.sourceMedia",
            } as const
          )[item.source],
    );
  const status = (item: Situation) => {
    if (item.source === "civil")
      return t(
        `civilMap.publication${civilPublicationLifecycle(item.data, now)}`,
      );
    if (item.phase === "ended") return t("civilMap.ended");
    if (item.source === "official") {
      const authority = t(`official.statuses.${item.data.status}`);
      return item.phase === "live"
        ? authority
        : t("civilMap.lastKnown", { status: authority });
    }
    if (item.source === "satellite")
      return t(
        item.phase === "archived"
          ? "civilMap.archived"
          : item.phase === "fading"
            ? "civilMap.quiet"
            : item.level === "confirmed"
              ? "stage.confirmed"
              : item.level === "probable"
                ? "civilMap.probable"
                : "civilMap.heatSignal",
      );
    if (item.source === "citizen") return t("map.reportUnverified");
    return t(
      item.data.onset && Date.parse(item.data.onset) > now
        ? "civilMap.upcoming"
        : "civilMap.current",
    );
  };
  return { t, locale, place, title, source, status };
}

export function SituationCard({
  item,
  units,
  now,
  selected,
  onSelect,
}: {
  item: Situation;
  units: AdminUnit[];
  now: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t, locale, place, title, source, status } = useSituationLabels(
    units,
    now,
  );
  const Icon = hazardIcons[item.category];
  return (
    <button
      data-situation-id={item.id}
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`w-full rounded-xl border p-3 text-start transition-colors focus-visible:outline-2 focus-visible:outline-primary lg:rounded-2xl lg:p-4 ${selected ? "border-primary bg-primary/5" : "border-border bg-surface hover:bg-muted/50"}`}
    >
      <span className="flex items-start gap-2.5 lg:gap-3">
        <span
          className={`shrink-0 rounded-lg p-2 lg:rounded-xl lg:p-2.5 ${item.source === "official" || item.source === "onm" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
        >
          <Icon aria-hidden className="size-4 lg:size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {source(item)}
          </span>
          <span
            dir="auto"
            lang={item.source === "civil" ? "fr" : undefined}
            className="mt-0.5 block break-words text-sm font-semibold leading-snug lg:mt-1 lg:text-base"
          >
            {title(item)}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground lg:mt-1">
            {status(item)}
          </span>
        </span>
      </span>
      <span className="mt-2 flex flex-wrap justify-between gap-1 border-t border-border/60 pt-2 text-xs text-muted-foreground lg:mt-3 lg:gap-2 lg:pt-2.5">
        <span dir="auto">{place(item)}</span>
        <time dateTime={item.at}>{relativeTime(item.at, locale, now)}</time>
      </span>
      {(item.lat === null || item.lon === null) && (
        <span className="mt-1 block text-xs text-muted-foreground">
          {t("civilMap.unknownLocation")}
        </span>
      )}
      {(item.source === "onm" ||
        item.source === "official" ||
        item.source === "civil") &&
        item.lat !== null && (
          <span className="mt-1 block text-xs text-muted-foreground">
            {t("civilMap.areaPrecision")}
          </span>
        )}
    </button>
  );
}

export function SituationDetails({
  item,
  units,
  now,
}: {
  item: Situation;
  units: AdminUnit[];
  now: number;
}) {
  const { t, locale, place, title, source, status } = useSituationLabels(
    units,
    now,
  );
  if (item.source === "official")
    return (
      <>
        <p className="mb-4 rounded-xl bg-muted p-3 text-sm">
          {t("civilMap.areaPrecision")}
        </p>
        <OfficialIncidentDetail
          incident={
            item.data.precision === "wilaya"
              ? { ...item.data, commune: null }
              : item.data
          }
          locale={locale}
          now={now}
        />
      </>
    );
  if (item.source === "citizen")
    return <HazardReportDetail report={item.data} locale={locale} now={now} />;
  if (item.source === "civil")
    return (
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">
            {source(item)} · {item.data.source_name}
          </p>
          <h2
            dir="auto"
            lang="fr"
            className="mt-2 break-words text-lg font-semibold"
          >
            {title(item)}
          </h2>
          <p className="mt-2 text-sm font-medium">{status(item)}</p>
        </div>
        <p className="rounded-xl bg-muted p-3 text-sm">
          {t("civilMap.publicationNotice")}
        </p>
        {item.phase !== "live" && (
          <p className="rounded-xl border p-3 text-sm">
            {t("civilMap.publicationHistorical")}
          </p>
        )}
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">{t("civilMap.area")}</dt>
            <dd dir="auto">{place(item)}</dd>
          </div>
          {(
            [
              ["sourcePublishedAt", item.data.source_published_at],
              ["publicationUpdatedAt", item.data.updated_at],
              ["validUntil", item.data.expires_at],
            ] as const
          ).map(([key, value]) => (
            <div key={key}>
              <dt className="text-muted-foreground">{t(`civilMap.${key}`)}</dt>
              <dd>
                <time dateTime={value}>
                  {new Date(value).toLocaleString(locale)}
                </time>
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          {t("civilMap.areaPrecision")}
        </p>
        {/^https?:\/\//.test(item.data.source_url) && (
          <a
            href={item.data.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center justify-center rounded-xl border px-4 text-sm font-semibold"
          >
            {t("civilMap.openSource")}
          </a>
        )}
      </div>
    );
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold text-primary">{source(item)}</p>
        <h2 dir="auto" className="mt-2 text-xl font-semibold">
          {title(item)}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{status(item)}</p>
      </div>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-muted-foreground">{t("civilMap.area")}</dt>
          <dd dir="auto" className="mt-1 font-medium">
            {place(item)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {t(
              item.source === "onm"
                ? "civilMap.issuedAt"
                : "civilMap.observedAt",
            )}
          </dt>
          <dd className="mt-1">
            <time dateTime={item.at}>
              {new Date(item.at).toLocaleString(locale)}
            </time>
          </dd>
        </div>
        {item.source === "onm" && (
          <>
            {(["severity", "certainty", "urgency"] as const).map((field) => (
              <div key={field}>
                <dt className="text-muted-foreground">
                  {t(`civilMap.${field}`)}
                </dt>
                <dd dir="auto">{item.data[field] || t("civilMap.unknown")}</dd>
              </div>
            ))}
            {item.data.onset && (
              <div>
                <dt className="text-muted-foreground">{t("civilMap.onset")}</dt>
                <dd>{new Date(item.data.onset).toLocaleString(locale)}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">
                {t("civilMap.validUntil")}
              </dt>
              <dd>
                {item.data.expires
                  ? new Date(item.data.expires).toLocaleString(locale)
                  : t("civilMap.unknown")}
              </dd>
            </div>
          </>
        )}
      </dl>
      {item.source === "onm" ? (
        <>
          <p className="rounded-xl bg-muted p-3 text-sm">
            {t("civilMap.areaPrecision")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("civilMap.noInstructions")}
          </p>
          {item.data.cap_url && /^https?:\/\//.test(item.data.cap_url) && (
            <a
              href={item.data.cap_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              {t("civilMap.openSource")}
            </a>
          )}
        </>
      ) : (
        <>
          <details className="rounded-xl border p-3">
            <summary className="cursor-pointer py-1 text-sm font-semibold">
              {t("civilMap.technical")}
            </summary>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <dt>{t("fire.detectionCount")}</dt>
              <dd>{item.data.detection_count}</dd>
              <dt>{t("fire.area")}</dt>
              <dd>
                {item.data.est_area_ha == null
                  ? "—"
                  : `${Math.round(item.data.est_area_ha)} ha`}
              </dd>
              <dt>{t("fire.peakFrp")}</dt>
              <dd>
                {item.data.max_frp_mw == null
                  ? "—"
                  : `${item.data.max_frp_mw} MW`}
              </dd>
            </dl>
          </details>
          <Link
            to="/fire/$id"
            params={{ id: item.data.short_id }}
            className="flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            {t("civilMap.openDetail")}
          </Link>
        </>
      )}
    </div>
  );
}
