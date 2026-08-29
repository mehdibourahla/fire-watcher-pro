import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, Phone, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSurvival } from "@/components/survival/survival-context";
import type { Locale } from "@/i18n";
import { adminUnitsQuery, relativeTime, settlementsQuery } from "@/lib/nadhir";
import { enqueueSos, loadSosQueue, type SosEntry } from "@/lib/sos-queue";
import { positionCard, type PositionCard } from "@/lib/survival";

export const Route = createFileRoute("/survival/sos")({
  component: SosPage,
});

function SosPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { online, position, pack } = useSurvival();

  const units = useQuery({ ...adminUnitsQuery, retry: online ? 3 : false });
  const settlements = useQuery({
    ...settlementsQuery,
    retry: online ? 3 : false,
  });
  const [queue, setQueue] = useState<SosEntry[]>(() =>
    loadSosQueue(localStorage),
  );

  const card = useMemo<PositionCard | null>(() => {
    if (position && units.data && settlements.data)
      return positionCard(
        position.lat,
        position.lon,
        units.data,
        settlements.data,
        locale,
      );
    if (pack)
      return {
        commune: pack.commune,
        wilaya: pack.wilaya,
        nearest: pack.nearest,
        coords: pack.coords,
      };
    return null;
  }, [position, units.data, settlements.data, pack, locale]);

  const onCall = () => {
    if (!online) {
      enqueueSos(localStorage, {
        lat: position?.lat ?? pack?.lat ?? null,
        lon: position?.lon ?? pack?.lon ?? null,
        note: null,
      });
      setQueue(loadSosQueue(localStorage));
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Link
          to="/survival"
          className="rounded-md p-1.5 hover:bg-muted"
          aria-label={t("common.back")}
        >
          <ChevronLeft aria-hidden className="size-5 rtl:rotate-180" />
        </Link>
        <h1 className="font-display text-xl">{t("survival.sos")}</h1>
      </div>

      <section className="card-raised">
        <h2 className="px-4 pt-3.5 text-[11px] font-bold tracking-wider text-muted-foreground">
          {t("survival.sosPosition").toUpperCase()}
        </h2>
        <dl>
          <PositionRow
            label={t("survival.sosCommune")}
            value={
              card?.commune
                ? card.wilaya
                  ? `${card.commune}, ${card.wilaya}`
                  : card.commune
                : t("common.none")
            }
          />
          <PositionRow
            label={t("survival.sosNearest")}
            value={
              card?.nearest
                ? t("survival.sosNearestValue", {
                    km: card.nearest.km.toFixed(1),
                    place: card.nearest.name,
                  })
                : t("common.none")
            }
          />
          <PositionRow
            label={t("survival.sosCoords")}
            value={card?.coords ?? t("common.none")}
            tabular
          />
        </dl>
      </section>

      <section className="mt-auto flex flex-col gap-2.5">
        <a
          href="tel:14"
          onClick={onCall}
          className="flex h-[72px] items-center justify-center gap-3 rounded-2xl"
          style={{
            backgroundColor: "var(--emergency)",
            color: "var(--surface)",
          }}
        >
          <Phone aria-hidden className="size-6" />
          <span className="flex flex-col">
            <span className="text-lg font-bold leading-tight">
              {t("survival.sosCall")}
            </span>
            <span className="text-xs opacity-85">{t("survival.sosFree")}</span>
          </span>
        </a>
        <div className="flex gap-2.5">
          <a
            href="tel:1070"
            className="card flex h-12 flex-1 items-center justify-center gap-1.5 text-sm font-semibold"
          >
            {t("emergency.forest")} <span className="tabular">1070</span>
          </a>
          <a
            href="tel:112"
            className="card flex h-12 flex-1 items-center justify-center gap-1.5 text-sm font-semibold"
          >
            {t("emergency.general")} <span className="tabular">112</span>
          </a>
        </div>

        {queue.filter((e) => !e.sent).length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {queue
              .filter((e) => !e.sent)
              .map((e) => (
                <li
                  key={e.id}
                  className="tabular rounded-lg px-3 py-2 text-xs font-medium"
                  style={{
                    backgroundColor: "var(--risk-tint-2)",
                    color: "var(--risk-ink-2)",
                  }}
                >
                  {t("survival.sosQueued", {
                    time: relativeTime(e.created_at, locale),
                  })}
                </li>
              ))}
          </ul>
        ) : null}

        <p
          className="flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-[13px] leading-relaxed"
          style={{
            backgroundColor: "var(--risk-tint-2)",
            color: "var(--risk-ink-2)",
          }}
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t("survival.sosQueueNote")}
        </p>
      </section>
    </>
  );
}

function PositionRow({
  label,
  value,
  tabular = false,
}: {
  label: string;
  value: string;
  tabular?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-border px-4 py-3">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd
        className={`text-end text-base font-semibold ${tabular ? "tabular" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
