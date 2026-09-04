import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { StatCard } from "@/components/nadhir/StatCard";
import { EmptyState, SkeletonList } from "@/components/nadhir/states";
import type { Locale } from "@/i18n";
import {
  adminUnitsQuery,
  algiersTime,
  historyClustersQuery,
  intlLocale,
  unitName,
  type FireCluster,
} from "@/lib/nadhir";
import { pageMeta } from "@/lib/page-meta";

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

const REAL_FIRE_STATES = new Set([
  "active",
  "unconfirmed",
  "contained_guess",
  "extinguished",
]);

const yearOf = (c: FireCluster) =>
  new Date(c.first_detected_at).getUTCFullYear();
const areaOf = (c: FireCluster) => c.est_area_ha ?? 0;

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number | string; name?: string }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card-raised px-2.5 py-1.5 text-xs">
      <p className="font-medium">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="tabular text-muted-foreground">
          {p.name}:{" "}
          {typeof p.value === "number"
            ? Math.round(p.value).toLocaleString()
            : p.value}
        </p>
      ))}
    </div>
  );
}

function HistoryPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const clusters = useQuery(historyClustersQuery);
  const units = useQuery(adminUnitsQuery);

  const [season, setSeason] = useState<"all" | number>("all");
  const [wilayaId, setWilayaId] = useState<string>("all");

  const all = useMemo(
    () => (clusters.data ?? []).filter((c) => REAL_FIRE_STATES.has(c.state)),
    [clusters.data],
  );

  const wilayas = useMemo(
    () => (units.data ?? []).filter((u) => u.level === "wilaya"),
    [units.data],
  );
  const wilayaById = useMemo(
    () => new Map(wilayas.map((u) => [u.id, u])),
    [wilayas],
  );
  const years = useMemo(
    () => [...new Set(all.map(yearOf))].sort((a, b) => b - a),
    [all],
  );

  const filtered = useMemo(
    () =>
      all.filter(
        (c) =>
          (season === "all" || yearOf(c) === season) &&
          (wilayaId === "all" || c.wilaya_id === wilayaId),
      ),
    [all, season, wilayaId],
  );

  const stats = useMemo(() => {
    const byWilaya = new Map<string, { fires: number; area: number }>();
    let area = 0;
    for (const c of filtered) {
      area += areaOf(c);
      if (!c.wilaya_id) continue;
      const agg = byWilaya.get(c.wilaya_id) ?? { fires: 0, area: 0 };
      agg.fires += 1;
      agg.area += areaOf(c);
      byWilaya.set(c.wilaya_id, agg);
    }
    const ranked = [...byWilaya.entries()]
      .map(([id, agg]) => ({ id, wilaya: wilayaById.get(id), ...agg }))
      .filter((r) => r.wilaya)
      .sort((a, b) => b.area - a.area)
      .slice(0, 10);
    return {
      total: filtered.length,
      area,
      ranked,
      unlocated: filtered.filter((c) => !c.wilaya_id).length,
    };
  }, [filtered, wilayaById]);

  const monthNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(intlLocale(locale), {
      month: "short",
      timeZone: "UTC",
    });
    return Array.from({ length: 12 }, (_, m) =>
      fmt.format(new Date(Date.UTC(2024, m, 1))),
    );
  }, [locale]);

  const monthly = useMemo(() => {
    const buckets = Array.from({ length: 12 }, () => ({ fires: 0, area: 0 }));
    for (const c of filtered) {
      const m = new Date(c.first_detected_at).getUTCMonth();
      buckets[m]!.fires += 1;
      buckets[m]!.area += areaOf(c);
    }
    let running = 0;
    return buckets.map((b, i) => {
      running += b.area;
      return {
        month: monthNames[i]!,
        fires: b.fires,
        cumulative: Math.round(running),
      };
    });
  }, [filtered, monthNames]);

  function exportCsv() {
    const header =
      "short_id,state,first_detected_at,last_detected_at,lat,lon,est_area_ha,confidence\n";
    const body = filtered
      .map((c) =>
        [
          c.short_id,
          c.state,
          c.first_detected_at,
          c.last_detected_at,
          c.lat,
          c.lon,
          c.est_area_ha ?? "",
          c.confidence,
        ].join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([header + body], { type: "text/csv" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `nadhir-fires-${season === "all" ? "all" : season}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const axis = { stroke: "var(--ink-faint)", fontSize: 11 };

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">{t("history.title")}</h1>
        <button
          type="button"
          onClick={exportCsv}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <Download aria-hidden className="size-4" />
          {t("history.exportCsv")}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <label className="text-sm">
          <span className="me-2 text-muted-foreground">
            {t("history.season")}
          </span>
          <select
            value={String(season)}
            onChange={(e) =>
              setSeason(
                e.target.value === "all" ? "all" : Number(e.target.value),
              )
            }
            className="rounded-md border border-border bg-surface px-3 py-1.5"
          >
            <option value="all">{t("history.allSeasons")}</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="me-2 text-muted-foreground">
            {t("history.filterWilaya")}
          </span>
          <select
            value={wilayaId}
            onChange={(e) => setWilayaId(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-1.5"
          >
            <option value="all">{t("history.allWilayas")}</option>
            {wilayas.map((w) => (
              <option key={w.id} value={w.id}>
                {unitName(w, locale)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {clusters.isLoading ? (
        <SkeletonList rows={3} className="mt-5" />
      ) : filtered.length === 0 ? (
        <EmptyState title={t("history.empty")} className="mt-5" />
      ) : (
        <>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
            <StatCard label={t("history.totalFires")} value={stats.total} />
            <StatCard
              explain={t("explain.area")}
              label={t("history.burnedArea")}
              value={`${Math.round(stats.area).toLocaleString()} ${t("common.ha")}`}
            />
            <StatCard
              label={t("history.worstWilaya")}
              value={
                stats.ranked[0]?.wilaya
                  ? unitName(stats.ranked[0].wilaya, locale)
                  : t("common.none")
              }
            />
          </div>

          <section className="card mt-4 p-4">
            <h2 className="text-base">{t("history.monthly")}</h2>
            <div className="mt-3 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={monthly}
                  margin={{ top: 4, right: 4, bottom: 0, left: -18 }}
                >
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tick={axis}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={axis}
                    allowDecimals={false}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: "var(--raised)" }}
                  />
                  <Bar
                    dataKey="fires"
                    name={t("history.fires")}
                    fill="var(--risk-4)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("history.monthlyNote")}
            </p>
          </section>

          <section className="card mt-4 p-4">
            <h2 className="text-base">{t("history.cumulative")}</h2>
            <div className="mt-3 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={monthly}
                  margin={{ top: 4, right: 4, bottom: 0, left: -6 }}
                >
                  <defs>
                    <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="var(--accent)"
                        stopOpacity={0.35}
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--accent)"
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tick={axis}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={axis}
                    width={54}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="cumulative"
                    name={t("history.burnedArea")}
                    stroke="var(--accent)"
                    strokeWidth={2}
                    fill="url(#areaFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card mt-4 p-4">
            <h2 className="text-base">{t("history.byWilaya")}</h2>
            {stats.ranked.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {t("history.noWilaya")}
              </p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {stats.ranked.map((r) => (
                  <li key={r.id}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span>{unitName(r.wilaya!, locale)}</span>
                      <span className="tabular text-muted-foreground">
                        {t("history.fireCount", { count: r.fires })} ·{" "}
                        {Math.round(r.area).toLocaleString()} {t("common.ha")}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(r.area / (stats.ranked[0]?.area || 1)) * 100}%`,
                          backgroundColor: "var(--risk-4)",
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {stats.unlocated > 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {t("history.unlocated", { count: stats.unlocated })}
              </p>
            ) : null}
          </section>

          <section className="card mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 text-start font-medium">ID</th>
                  <th className="p-3 text-start font-medium">
                    {t("status.health")}
                  </th>
                  <th className="p-3 text-start font-medium">
                    {t("fire.firstSeen")}
                  </th>
                  <th className="p-3 text-end font-medium">
                    {t("history.area")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 300).map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="p-3 font-medium">{c.short_id}</td>
                    <td className="p-3">{t(`state.${c.state}`)}</td>
                    <td className="p-3 tabular">
                      {algiersTime(c.first_detected_at)}
                    </td>
                    <td className="p-3 text-end tabular">
                      {Math.round(areaOf(c))} {t("common.ha")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <p className="mt-3 text-xs text-muted-foreground">
            {t("history.methodology")}
          </p>
        </>
      )}
    </div>
  );
}
