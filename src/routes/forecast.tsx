import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { DangerScale } from "@/components/nadhir/DangerScale";
import { RiskChip } from "@/components/nadhir/RiskChip";
import { EmptyState, SkeletonList } from "@/components/nadhir/states";
import { RiskLegend } from "@/components/SiteChrome";
import type { Locale } from "@/i18n";
import {
  adminUnitsQuery,
  riskForecastsQuery,
  unitName,
  type AdminUnit,
} from "@/lib/nadhir";

export const Route = createFileRoute("/forecast")({
  head: () => ({
    meta: [
      { title: "Fire danger forecast — Nadhir Algeria" },
      {
        name: "description",
        content:
          "Six-day Fire Weather Index outlook and plain-language safety guidance for every commune covered by Nadhir.",
      },
      {
        property: "og:title",
        content: "Fire danger forecast — Nadhir Algeria",
      },
      {
        property: "og:description",
        content:
          "Daily fire danger levels and 6-day FWI outlook for Algerian communes.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(riskForecastsQuery),
      context.queryClient.ensureQueryData(adminUnitsQuery),
    ]),
  component: ForecastPage,
});

type Day = { fwi: number; level: number };
type Row = { commune: AdminUnit; days: Record<number, Day> };

const HORIZONS = [0, 1, 2, 3, 4, 5];

function ForecastPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const [search, setSearch] = useState("");
  const [pinned, setPinned] = useState<string | null>(null);

  const forecasts = useQuery(riskForecastsQuery);
  const units = useQuery(adminUnitsQuery);

  const rows = useMemo<Row[]>(() => {
    const communes = (units.data ?? []).filter((u) => u.level === "commune");
    const byCommune = new Map<string, Record<number, Day>>();
    for (const f of forecasts.data ?? []) {
      const entry = byCommune.get(f.commune_id) ?? {};
      entry[f.horizon_days] = { fwi: f.fwi, level: f.danger_level };
      byCommune.set(f.commune_id, entry);
    }
    return communes
      .map((commune) => ({ commune, days: byCommune.get(commune.id) ?? {} }))
      .filter((r) => Object.keys(r.days).length > 0)
      .sort((a, b) => (b.days[0]?.level ?? 0) - (a.days[0]?.level ?? 0));
  }, [forecasts.data, units.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [
        r.commune.name_ar,
        r.commune.name_fr,
        r.commune.name_en,
        r.commune.name_kab,
      ]
        .filter(Boolean)
        .some((n) => n!.toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const featured = filtered.find((r) => r.commune.id === pinned) ?? filtered[0];

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6">
      <h1 className="text-2xl">{t("risk.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("risk.sixDay")}</p>

      {forecasts.isLoading ? (
        <SkeletonList rows={2} className="mt-5" />
      ) : featured ? (
        <section className="card mt-5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-display text-xl">
                {unitName(featured.commune, locale)}
              </p>
              <p className="text-xs text-muted-foreground">{t("risk.today")}</p>
            </div>
            <RiskLegend className="max-w-xs" />
          </div>

          <DangerScale
            level={featured.days[0]?.level ?? 1}
            fwi={featured.days[0]?.fwi ?? 0}
            size="lg"
            guidance
            className="mt-4"
          />

          <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {HORIZONS.map((h) => {
              const day = featured.days[h];
              return (
                <div key={h} className="card flex flex-col gap-2 p-2.5">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {h === 0 ? t("risk.today") : t("risk.dayLabel", { n: h })}
                  </span>
                  {day ? (
                    <DangerScale level={day.level} fwi={day.fwi} size="sm" />
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {t("common.none")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="mt-6 flex items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search
            aria-hidden
            className="pointer-events-none absolute inset-inline-start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            style={{ insetInlineStart: "0.75rem" }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("risk.searchCommune")}
            aria-label={t("risk.searchCommune")}
            className="w-full rounded-lg border border-border bg-surface py-2 pe-3 ps-9 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title={t("risk.noResults")} className="mt-4" />
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {filtered.map((row) => (
            <li key={row.commune.id}>
              <button
                type="button"
                onClick={() => setPinned(row.commune.id)}
                aria-pressed={featured?.commune.id === row.commune.id}
                className="card flex w-full flex-wrap items-center gap-x-4 gap-y-2 p-3 text-start transition-colors hover:bg-muted"
              >
                <span className="min-w-40 flex-1 font-medium">
                  {unitName(row.commune, locale)}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {HORIZONS.map((h) => {
                    const day = row.days[h];
                    return day ? (
                      <RiskChip key={h} level={day.level} showName={false} />
                    ) : (
                      <span
                        key={h}
                        className="px-1 text-xs text-muted-foreground"
                      >
                        —
                      </span>
                    );
                  })}
                </span>
                <span className="tabular text-sm text-muted-foreground">
                  {t("risk.fwi")} {(row.days[0]?.fwi ?? 0).toFixed(0)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
