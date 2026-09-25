import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { HAZARD_COLOR, HazardChart } from "@/components/history/HazardChart";
import { StatCard } from "@/components/nadhir/StatCard";
import {
  EmptyState,
  ErrorState,
  SkeletonList,
} from "@/components/nadhir/states";
import type { Locale } from "@/i18n";
import {
  buckets,
  coverage,
  fireRecords,
  HAZARDS,
  historyCsv,
  roadRecords,
  weatherRecords,
  wilayaRanking,
  type Hazard,
  type HistoryRecord,
} from "@/lib/hazard-history";
import {
  adminUnitsQuery,
  algiersTime,
  historyClustersQuery,
  intlLocale,
  officialHistoryQuery,
  onmHistoryQuery,
  roadHistoryQuery,
  unitName,
} from "@/lib/nadhir";
import { pageMeta } from "@/lib/page-meta";
import { ONM_SEVERITY } from "@/lib/zone-hazards";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: pageMeta("history.metaTitle", "history.metaDescription"),
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(historyClustersQuery),
      context.queryClient.ensureQueryData(adminUnitsQuery),
    ]),
  component: HistoryPage,
});

const SHOWN = 300;
const yearOf = (iso: string) => new Date(iso).getUTCFullYear();

function HistoryPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const clusters = useQuery(historyClustersQuery);
  const units = useQuery(adminUnitsQuery);
  const onm = useQuery(onmHistoryQuery);
  const road = useQuery(roadHistoryQuery);
  const official = useQuery(officialHistoryQuery);
  const [now] = useState(() => Date.now());

  const [hazard, setHazard] = useState<"all" | Hazard>("all");
  const [wilayaId, setWilayaId] = useState("all");
  const [year, setYear] = useState<"all" | number>("all");

  const sources = { fire: clusters, weather: onm, road } as const;
  const failed = HAZARDS.filter((h) => sources[h].isError);
  const loading = units.isPending || HAZARDS.some((h) => sources[h].isPending);

  const records = useMemo(
    () =>
      [
        ...fireRecords(clusters.data ?? []),
        ...weatherRecords(onm.data ?? []),
        ...roadRecords(road.data ?? [], units.data ?? []),
      ].sort((a, b) => b.at.localeCompare(a.at)),
    [clusters.data, onm.data, road.data, units.data],
  );
  const since = useMemo(() => coverage(records), [records]);
  const years = useMemo(
    () => [...new Set(records.map((r) => yearOf(r.at)))].sort((a, b) => b - a),
    [records],
  );
  const wilayas = useMemo(
    () => (units.data ?? []).filter((u) => u.level === "wilaya"),
    [units.data],
  );
  const wilayaName = useMemo(
    () => new Map(wilayas.map((w) => [w.id, unitName(w, locale)])),
    [wilayas, locale],
  );

  const inView: Hazard[] = hazard === "all" ? HAZARDS : [hazard];
  const filtered = useMemo(
    () =>
      records.filter(
        (r) =>
          (hazard === "all" || r.hazard === hazard) &&
          (wilayaId === "all" || r.wilayaId === wilayaId) &&
          (year === "all" || yearOf(r.at) === year),
      ),
    [records, hazard, wilayaId, year],
  );
  const chart = useMemo(() => buckets(filtered, now), [filtered, now]);
  const ranking = useMemo(
    () => wilayaRanking(filtered, units.data ?? [], hazard === "fire"),
    [filtered, units.data, hazard],
  );
  const fires = filtered.filter((r) => r.hazard === "fire");
  const burned = fires.reduce((sum, r) => sum + (r.fire?.areaHa ?? 0), 0);
  const officialCount = (official.data ?? []).filter(
    (o) =>
      (wilayaId === "all" || o.wilaya_id === wilayaId) &&
      (year === "all" || yearOf(o.first_reported_at) === year),
  ).length;
  const cumulative = useMemo(() => {
    let running = 0;
    return chart.rows.map((row) => {
      running += row.burnedHa;
      return { start: row.start, cumulative: Math.round(running) };
    });
  }, [chart.rows]);

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Algiers",
  });
  const coverageList = HAZARDS.filter((h) => since[h])
    .map((h) =>
      t("history.coverageItem", {
        hazard: t(`history.hazard.${h}`),
        date: dateFormat.format(new Date(since[h]!)),
      }),
    )
    .join(locale === "ar" ? "، " : ", ");

  const events = new Map<string, number>();
  const severities = new Map<number, number>();
  for (const r of filtered)
    if (r.weather) {
      events.set(r.weather.event, (events.get(r.weather.event) ?? 0) + 1);
      const level = ONM_SEVERITY[r.weather.severity] ?? 1;
      severities.set(level, (severities.get(level) ?? 0) + 1);
    }

  function exportCsv() {
    const url = URL.createObjectURL(
      new Blob([historyCsv(filtered, units.data ?? [])], {
        type: "text/csv",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `nadhir-history-${hazard}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const detail = (r: HistoryRecord) =>
    r.fire
      ? `${Math.round(r.fire.areaHa)} ${t("common.ha")}`
      : r.weather
        ? `${t(`weather:outlook.onmLevel.${ONM_SEVERITY[r.weather.severity] ?? 1}`)}, ${t(`weather:outlook.event.${r.weather.event}`)}`
        : (r.road?.summary ?? "");

  const select =
    "min-h-11 rounded-md border border-border bg-surface px-3 text-sm";

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">{t("history.title")}</h1>
        <button
          type="button"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted disabled:opacity-50"
        >
          <Download aria-hidden className="size-4" />
          {t("history.exportCsv")}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            {t("history.filterHazard")}
          </span>
          <select
            value={hazard}
            onChange={(e) => setHazard(e.target.value as "all" | Hazard)}
            className={select}
          >
            <option value="all">{t("history.allHazards")}</option>
            {HAZARDS.map((h) => (
              <option key={h} value={h}>
                {t(`history.hazard.${h}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            {t("history.filterWilaya")}
          </span>
          <select
            value={wilayaId}
            onChange={(e) => setWilayaId(e.target.value)}
            className={select}
          >
            <option value="all">{t("history.allWilayas")}</option>
            {wilayas.map((w) => (
              <option key={w.id} value={w.id}>
                {unitName(w, locale)}
              </option>
            ))}
          </select>
        </label>
        {years.length > 1 ? (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("history.season")}</span>
            <select
              value={String(year)}
              onChange={(e) =>
                setYear(
                  e.target.value === "all" ? "all" : Number(e.target.value),
                )
              }
              className={select}
            >
              <option value="all">{t("history.allSeasons")}</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {!loading && coverageList ? (
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
          {t("history.coverage", { list: coverageList })}
        </p>
      ) : null}

      {failed.map((h) => (
        <ErrorState
          key={h}
          body={t("history.sourceError", {
            hazard: t(`history.hazard.${h}`),
          })}
          onRetry={() => void sources[h].refetch()}
          className="mt-3"
        />
      ))}

      {loading ? (
        <SkeletonList rows={3} className="mt-5" />
      ) : filtered.length === 0 ? (
        <EmptyState title={t("history.empty")} className="mt-5" />
      ) : (
        <>
          <HazardChart
            rows={chart.rows}
            granularity={chart.granularity}
            hazards={inView}
          />

          {inView.includes("fire") && fires.length ? (
            <section className="mt-6">
              <h2 className="text-lg">{t("history.fireTitle")}</h2>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                <StatCard
                  label={t("history.totalFires")}
                  value={fires.length}
                />
                <StatCard
                  explain={t("explain.area")}
                  label={t("history.burnedArea")}
                  value={`${Math.round(burned).toLocaleString(intlLocale(locale))} ${t("common.ha")}`}
                />
                <StatCard
                  label={t("history.officialReports")}
                  value={
                    official.isSuccess
                      ? officialCount
                      : official.isError
                        ? t("common.unavailable")
                        : "…"
                  }
                />
              </div>
              <div className="card mt-3 p-4">
                <h3 className="text-base">{t("history.cumulative")}</h3>
                <div className="mt-3 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={cumulative}
                      margin={{ top: 4, right: 4, bottom: 0, left: -6 }}
                    >
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="start"
                        tickLine={false}
                        axisLine={false}
                        tick={{ stroke: "var(--ink-faint)", fontSize: 11 }}
                        tickFormatter={(d: string) => d.slice(5)}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ stroke: "var(--ink-faint)", fontSize: 11 }}
                        width={54}
                      />
                      <Area
                        type="monotone"
                        dataKey="cumulative"
                        name={t("history.burnedArea")}
                        stroke={HAZARD_COLOR.fire}
                        strokeWidth={2}
                        fill={HAZARD_COLOR.fire}
                        fillOpacity={0.12}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("history.methodology")}
                </p>
              </div>
            </section>
          ) : null}

          {inView.includes("weather") && events.size ? (
            <section className="mt-6">
              <h2 className="text-lg">{t("history.weatherTitle")}</h2>
              <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3 text-sm">
                <ul className="space-y-1">
                  {[...events.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([event, count]) => (
                      <li key={event} className="flex gap-3">
                        <span className="min-w-28">
                          {t(`weather:outlook.event.${event}`)}
                        </span>
                        <span className="tabular text-muted-foreground">
                          {t("history.weatherCount", { count })}
                        </span>
                      </li>
                    ))}
                </ul>
                <ul className="space-y-1">
                  {[...severities.entries()]
                    .sort((a, b) => b[0] - a[0])
                    .map(([level, count]) => (
                      <li key={level} className="flex gap-3">
                        <span className="min-w-28">
                          {t(`weather:outlook.onmLevel.${level}`)}
                        </span>
                        <span className="tabular text-muted-foreground">
                          {t("history.weatherCount", { count })}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            </section>
          ) : null}

          {inView.includes("road") &&
          filtered.some((r) => r.hazard === "road") ? (
            <section className="mt-6">
              <h2 className="text-lg">{t("history.roadTitle")}</h2>
              <ul className="mt-3 divide-y divide-border border-y border-border text-sm">
                {filtered
                  .filter((r) => r.hazard === "road")
                  .slice(0, 5)
                  .map((r) => (
                    <li key={r.id} className="py-2.5">
                      <p>{r.road?.summary}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {algiersTime(r.at)}
                        {r.wilayaId && wilayaName.get(r.wilayaId)
                          ? ` · ${wilayaName.get(r.wilayaId)}`
                          : ""}
                      </p>
                    </li>
                  ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("history.roadNote")}
              </p>
            </section>
          ) : null}

          <section className="mt-6">
            <h2 className="text-lg">{t("history.byWilaya")}</h2>
            {ranking.ranked.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {t("history.noWilaya")}
              </p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {ranking.ranked.map((row) => {
                  const top = ranking.ranked[0]!;
                  const share =
                    hazard === "fire"
                      ? row.burnedHa / (top.burnedHa || 1)
                      : row.total / (top.total || 1);
                  return (
                    <li key={row.wilaya.id}>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                        <span>{unitName(row.wilaya, locale)}</span>
                        <span className="tabular text-muted-foreground">
                          {inView
                            .filter((h) => row.counts[h])
                            .map((h) =>
                              t(`history.${h}Count`, { count: row.counts[h] }),
                            )
                            .join(" · ")}
                          {hazard === "fire"
                            ? ` · ${Math.round(row.burnedHa).toLocaleString(intlLocale(locale))} ${t("common.ha")}`
                            : ""}
                        </span>
                      </div>
                      <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-muted">
                        {hazard === "fire" ? (
                          <div
                            className="h-full"
                            style={{
                              width: `${share * 100}%`,
                              backgroundColor: HAZARD_COLOR.fire,
                            }}
                          />
                        ) : (
                          inView.map((h) => (
                            <div
                              key={h}
                              className="h-full"
                              style={{
                                width: `${(row.counts[h] / (top.total || 1)) * 100}%`,
                                backgroundColor: HAZARD_COLOR[h],
                              }}
                            />
                          ))
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {ranking.unlocated > 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {t("history.unlocated", { count: ranking.unlocated })}
              </p>
            ) : null}
          </section>

          <section className="mt-6">
            <h2 className="text-lg">{t("history.recordsTitle")}</h2>
            <div className="card mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">
                      {t("history.colDate")}
                    </th>
                    <th className="p-3 text-start font-medium">
                      {t("history.colHazard")}
                    </th>
                    <th className="p-3 text-start font-medium">
                      {t("history.colPlace")}
                    </th>
                    <th className="p-3 text-start font-medium">
                      {t("history.colDetail")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, SHOWN).map((r) => (
                    <tr
                      key={`${r.hazard}:${r.id}`}
                      className="border-t border-border align-top"
                    >
                      <td className="whitespace-nowrap p-3 tabular">
                        {algiersTime(r.at)}
                      </td>
                      <td className="p-3">
                        {r.fire ? (
                          <Link
                            to="/fire/$id"
                            params={{ id: r.fire.shortId }}
                            className="inline-flex min-h-11 items-center text-primary underline"
                          >
                            {t("history.hazard.fire")} {r.fire.shortId}
                          </Link>
                        ) : (
                          t(`history.hazard.${r.hazard}`)
                        )}
                      </td>
                      <td className="p-3">
                        {r.wilayaId ? (wilayaName.get(r.wilayaId) ?? "") : ""}
                      </td>
                      <td className="max-w-md p-3">{detail(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > SHOWN ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("history.recordsShown", {
                  shown: SHOWN,
                  total: filtered.length,
                })}
              </p>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
