import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { CommunePicker } from "@/components/forecast/CommunePicker";
import { NationalOutlook } from "@/components/forecast/NationalOutlook";
import { OutlookGrid, type Row } from "@/components/forecast/OutlookGrid";
import { LazyDetails } from "@/components/LazyDetails";
import { DangerScale } from "@/components/nadhir/DangerScale";
import { EmptyState, SkeletonList } from "@/components/nadhir/states";
import { WeatherForecast } from "@/components/nadhir/WeatherForecast";
import { RiskLegend } from "@/components/SiteChrome";
import type { Locale } from "@/i18n";
import { zonesQuery } from "@/lib/account";
import { airForecastQuery } from "@/lib/air-quality";
import {
  airCells,
  defaultCommune,
  fireCells,
  nationalRanking,
  onmCells,
  outlookDays,
  weatherCells,
} from "@/lib/forecast-outlook";
import {
  adminUnitsQuery,
  communeRiskForecastsQuery,
  effisDangerQuery,
  isStaleForecastDate,
  onmVigilanceQuery,
  relativeTime,
  todayRiskForecastsQuery,
  unitName,
  type AdminUnit,
} from "@/lib/nadhir";
import { pageMeta } from "@/lib/page-meta";

type ForecastSearch = { commune?: string };

const STORED_COMMUNE = "nadhir.forecast.commune";

function storedCommune(): string | null {
  try {
    return localStorage.getItem(STORED_COMMUNE);
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/forecast")({
  validateSearch: (search: Record<string, unknown>): ForecastSearch => {
    // the router JSON-parses search values, so a plain ?commune=1503 arrives as a number
    const raw = search["commune"];
    const commune = Number.isInteger(raw) ? String(raw) : raw;
    return typeof commune === "string" && /^[0-9A-Za-z-]{1,12}$/.test(commune)
      ? { commune }
      : {};
  },
  head: () => ({
    meta: pageMeta("weather:metaTitle", "weather:metaDescription"),
  }),
  component: ForecastPage,
});

function rowOf<T, D>(
  query: {
    isPending: boolean;
    isError: boolean;
    data: D | undefined;
    refetch: () => unknown;
  },
  cells: (data: D) => T[],
): Row<T> {
  if (query.isError) return { status: "error", retry: () => query.refetch() };
  if (query.isPending || query.data === undefined) return { status: "loading" };
  return { status: "ok", cells: cells(query.data) };
}

function ForecastPage() {
  const { t, i18n } = useTranslation("weather");
  const locale = i18n.language as Locale;
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const gridRef = useRef<HTMLHeadingElement>(null);
  const [days] = useState(() => outlookDays(Date.now()));

  const units = useQuery(adminUnitsQuery);
  const zones = useQuery(zonesQuery);
  const onm = useQuery({ ...onmVigilanceQuery, retry: false });
  const today = useQuery(todayRiskForecastsQuery);
  const effis = useQuery(effisDangerQuery);

  const communes = useMemo(
    () => (units.data ?? []).filter((u) => u.level === "commune"),
    [units.data],
  );
  const selected = useMemo(
    () =>
      defaultCommune(
        communes,
        search.commune,
        zones.data ?? [],
        storedCommune(),
      ),
    [communes, search.commune, zones.data],
  );

  const risk = useQuery({
    ...communeRiskForecastsQuery(selected?.id ?? ""),
    enabled: !!selected,
  });
  const air = useQuery(
    airForecastQuery(
      selected ? { lat: selected.lat, lon: selected.lon } : null,
    ),
  );

  const pick = (commune: AdminUnit) => {
    try {
      localStorage.setItem(STORED_COMMUNE, commune.id);
    } catch {
      // storage can be unavailable (private mode); the URL still carries the choice
    }
    void navigate({ search: { commune: commune.code }, replace: true });
  };

  const ranking = useMemo(
    () =>
      nationalRanking(units.data ?? [], today.data ?? [], onm.data ?? [], days),
    [units.data, today.data, onm.data, days],
  );

  const wilaya = selected?.parent_id
    ? units.data?.find((u) => u.id === selected.parent_id)
    : null;
  const place = selected
    ? wilaya
      ? `${unitName(selected, locale)}${t("outlook.separator")}${unitName(wilaya, locale)}`
      : unitName(selected, locale)
    : "";
  const fireToday = risk.data?.find((r) => r.forecast_date === days[0]);
  const effisToday = selected ? effis.data?.get(selected.id) : undefined;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6">
      <h1 className="text-2xl">{t("pageTitle")}</h1>

      <div className="mt-5">
        {units.isPending ? (
          <SkeletonList rows={1} />
        ) : (
          <CommunePicker
            units={units.data ?? []}
            selected={selected}
            onPick={pick}
          />
        )}
      </div>

      <section className="card mt-5 p-4 sm:p-5">
        <h2 ref={gridRef} tabIndex={-1} className="sr-only">
          {place || t("outlook.choosePlace")}
        </h2>
        {units.isPending ? (
          <SkeletonList rows={4} />
        ) : !selected ? (
          <EmptyState
            title={t("outlook.emptyTitle")}
            body={t("outlook.emptyBody")}
          />
        ) : (
          <>
            <OutlookGrid
              days={days}
              place={place}
              onm={rowOf(onm, (data) =>
                onmCells(data, selected.parent_id ?? "", days),
              )}
              fire={rowOf(risk, (data) => fireCells(data, days))}
              weather={rowOf(risk, (data) => weatherCells(data, days))}
              air={rowOf(air, (data) => airCells(data, days))}
            />
            <p className="mt-4 max-w-3xl text-sm text-muted-foreground">
              {t("outlook.notes")}
            </p>

            {fireToday ? (
              <div className="mt-6 border-t border-border pt-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <h3 className="font-display text-lg">
                    {t("outlook.fireToday")}
                  </h3>
                  <RiskLegend className="max-w-xs" />
                </div>
                <DangerScale
                  level={fireToday.danger_level}
                  fwi={fireToday.fwi}
                  percentile={fireToday.fwi_percentile}
                  staleCaption={
                    isStaleForecastDate(fireToday.forecast_date)
                      ? t("translation:risk.staleAsOf", {
                          time: relativeTime(
                            `${fireToday.forecast_date}T00:00:00Z`,
                            locale,
                          ),
                        })
                      : null
                  }
                  guidance
                  className="mt-4"
                />
                {fireToday.fuel_limited ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("translation:risk.fuelLimited")}
                  </p>
                ) : null}
                <p className="mt-3 text-sm text-muted-foreground">
                  {effisToday
                    ? effisToday.danger_class === "masked"
                      ? t("translation:risk.effisMasked")
                      : t("translation:risk.effis", {
                          class: t(
                            `translation:risk.effisClass.${effisToday.danger_class}`,
                          ),
                        })
                    : t("translation:risk.effisNone")}
                </p>
              </div>
            ) : null}

            <LazyDetails
              key={selected.id}
              className="mt-6 border-t border-border pt-4"
              summaryClassName="flex min-h-11 cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden"
              summary={
                <>
                  <ChevronDown aria-hidden className="size-4 shrink-0" />
                  {t("outlook.hourly")}
                </>
              }
            >
              <WeatherForecast communeId={selected.id} />
            </LazyDetails>
          </>
        )}
      </section>

      <NationalOutlook
        rows={ranking}
        loading={units.isPending || today.isPending || onm.isPending}
        failed={units.isError || today.isError || onm.isError}
        onRetry={() => {
          void today.refetch();
          void onm.refetch();
        }}
        onPick={(row) => {
          const commune = communes.find((c) => c.id === row.targetCommuneId);
          if (!commune) return;
          pick(commune);
          gridRef.current?.scrollIntoView({ block: "start" });
          gridRef.current?.focus({ preventScroll: true });
        }}
      />
    </div>
  );
}
