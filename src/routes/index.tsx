import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { MapLayers } from "@/components/FireMap";
import { MapCanvas } from "@/components/MapCanvas";
import { DangerScale } from "@/components/nadhir/DangerScale";
import { DetailSheet } from "@/components/nadhir/DetailSheet";
import { LayerToggle } from "@/components/nadhir/LayerToggle";
import { RiskChip } from "@/components/nadhir/RiskChip";
import { riskSolid } from "@/components/nadhir/risk-visuals";
import { EmptyState, SkeletonList } from "@/components/nadhir/states";
import {
  DegradedBanner,
  EmergencyNumbers,
  RiskLegend,
} from "@/components/SiteChrome";
import type { Locale } from "@/i18n";
import {
  LIVE_STATES,
  adminUnitsQuery,
  clustersQuery,
  dataSourcesQuery,
  dangerLevelKey,
  relativeTime,
  riskForecastsQuery,
  settlementsQuery,
  placeLabel,
  type FireCluster,
} from "@/lib/nadhir";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nadhir — Live wildfire map for Algeria" },
      {
        name: "description",
        content:
          "Live satellite fire detections, fused fire clusters and daily fire danger levels across Algeria's wilayas and communes.",
      },
      {
        property: "og:title",
        content: "Nadhir — Live wildfire map for Algeria",
      },
      {
        property: "og:description",
        content:
          "Satellite wildfire detection and daily fire danger forecasting for Algeria, free and open source.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(clustersQuery),
      context.queryClient.ensureQueryData(adminUnitsQuery),
      context.queryClient.ensureQueryData(riskForecastsQuery),
    ]),
  component: LiveMapPage,
});

const LIST_PAGE = 20;

function stateRank(c: FireCluster) {
  return c.state === "active" ? 0 : c.state === "contained_guess" ? 1 : 2;
}

function LiveMapPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const [selected, setSelected] = useState<string | null>(null);
  const [layers, setLayers] = useState<MapLayers>({
    fires: true,
    unverified: false,
  });
  const [showAll, setShowAll] = useState(false);

  const clusters = useQuery(clustersQuery);
  const units = useQuery(adminUnitsQuery);
  const risk = useQuery(riskForecastsQuery);
  const settlements = useQuery(settlementsQuery);
  const sources = useQuery(dataSourcesQuery);

  const live = useMemo(
    () => (clusters.data ?? []).filter((c) => LIVE_STATES.includes(c.state)),
    [clusters.data],
  );
  const activeCount = live.filter((c) => c.state === "active").length;

  const settlementById = useMemo(
    () => new Map((settlements.data ?? []).map((s) => [s.id, s])),
    [settlements.data],
  );

  const national = useMemo(() => {
    const today = (risk.data ?? []).filter((r) => r.horizon_days === 0);
    return today.reduce(
      (acc, r) =>
        r.danger_level > acc.level
          ? { level: r.danger_level, fwi: r.fwi }
          : acc,
      { level: 1, fwi: 0 },
    );
  }, [risk.data]);

  const degraded = (sources.data ?? []).some((s) => s.status !== "ok");

  const sorted = useMemo(
    () =>
      [...live].sort((a, b) => {
        if (stateRank(a) !== stateRank(b)) return stateRank(a) - stateRank(b);
        return (
          (a.nearest_settlement_km ?? 9999) - (b.nearest_settlement_km ?? 9999)
        );
      }),
    [live],
  );

  const visible = showAll ? sorted : sorted.slice(0, LIST_PAGE);

  const labelFor = (cluster: FireCluster) =>
    placeLabel(cluster, units.data ?? [], settlements.data ?? [], locale);

  const selectedCluster = live.find((c) => c.short_id === selected) ?? null;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4 lg:h-[calc(100vh-3.5rem)] lg:flex-row">
      <aside className="order-2 flex w-full shrink-0 flex-col gap-3 lg:order-1 lg:w-[360px] lg:overflow-y-auto">
        <section className="card p-4">
          <h1 className="text-base">{t("map.todayIn")}</h1>
          <div className="mt-3 flex items-start justify-between gap-4">
            <DangerScale
              level={national.level}
              fwi={national.fwi}
              size="md"
              caption={t("map.nationalMax")}
              className="flex-1"
            />
            <div className="text-end">
              <p className="font-display tabular text-3xl leading-none">
                {activeCount}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {activeCount === 0
                  ? t("map.activeFires_zero")
                  : t("map.activeFires")}
              </p>
            </div>
          </div>
          <RiskLegend className="mt-4 border-t border-border pt-3" />
        </section>

        {degraded ? <DegradedBanner /> : null}

        <section className="card divide-y divide-border">
          {clusters.isLoading ? (
            <SkeletonList rows={3} className="p-3" />
          ) : sorted.length === 0 ? (
            <EmptyState
              title={t("map.activeFires_zero")}
              body={t("map.empty", {
                level: t(`risk.${dangerLevelKey(national.level)}`),
              })}
              className="border-0"
            />
          ) : (
            visible.map((cluster) => {
              const place = labelFor(cluster);
              const settlement = cluster.nearest_settlement_id
                ? settlementById.get(cluster.nearest_settlement_id)
                : undefined;
              return (
                <button
                  key={cluster.id}
                  type="button"
                  onClick={() => setSelected(cluster.short_id)}
                  aria-pressed={selected === cluster.short_id}
                  className={`flex w-full flex-col gap-1.5 p-3 text-start transition-colors hover:bg-muted ${
                    selected === cluster.short_id ? "bg-muted" : ""
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium">
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: riskSolid(
                            cluster.state === "active" ? 4 : 3,
                          ),
                          boxShadow: "0 0 0 1.5px var(--mark-ring)",
                        }}
                      />
                      {place.approximate
                        ? t("map.nearPlace", { place: place.name })
                        : place.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t(`state.${cluster.state}`)}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="tabular">
                      {Math.round(cluster.est_area_ha ?? 0)} {t("common.ha")}
                    </span>
                    <span className="tabular">
                      {cluster.detection_count} {t("map.detections")}
                    </span>
                    {settlement && cluster.nearest_settlement_km !== null ? (
                      <span className="tabular">
                        {settlement.name} ·{" "}
                        {cluster.nearest_settlement_km.toFixed(1)}{" "}
                        {t("common.km")}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("map.lastPass", {
                      time: relativeTime(cluster.last_detected_at, locale),
                    })}
                  </span>
                </button>
              );
            })
          )}
          {sorted.length > LIST_PAGE ? (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full p-3 text-sm font-medium text-primary hover:bg-muted"
            >
              {showAll
                ? t("map.showLess")
                : t("map.showAll", { count: sorted.length })}
            </button>
          ) : null}
        </section>

        <EmergencyNumbers />
      </aside>

      <section className="relative order-1 h-[55vh] min-h-80 overflow-hidden rounded-xl border border-border lg:order-2 lg:h-full lg:flex-1">
        <MapCanvas
          clusters={clusters.data ?? []}
          selectedShortId={selected}
          onSelect={(c) => setSelected(c.short_id)}
          layers={layers}
        />
        <LayerToggle layers={layers} onChange={setLayers} />
        <DetailSheet open={!!selectedCluster} onClose={() => setSelected(null)}>
          {selectedCluster ? (
            <ClusterDetail
              cluster={selectedCluster}
              locale={locale}
              placeName={(() => {
                const p = labelFor(selectedCluster);
                return p.approximate
                  ? t("map.nearPlace", { place: p.name })
                  : p.name;
              })()}
              settlementName={
                selectedCluster.nearest_settlement_id
                  ? (settlementById.get(selectedCluster.nearest_settlement_id)
                      ?.name ?? null)
                  : null
              }
            />
          ) : null}
        </DetailSheet>
      </section>
    </div>
  );
}

function ClusterDetail({
  cluster,
  locale,
  placeName,
  settlementName,
}: {
  cluster: FireCluster;
  locale: Locale;
  placeName: string;
  settlementName: string | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-display text-lg">{placeName}</p>
        <p className="text-sm text-muted-foreground">
          {t(`state.${cluster.state}`)} ·{" "}
          {t("map.lastPass", {
            time: relativeTime(cluster.last_detected_at, locale),
          })}
        </p>
      </div>

      {settlementName && cluster.nearest_settlement_km !== null ? (
        <p
          className="rounded-lg px-3 py-2 text-sm font-medium"
          style={{
            backgroundColor: "var(--emergency-surface)",
            color: "var(--emergency)",
          }}
        >
          {t("fire.nearSettlement", {
            settlement: settlementName,
            km: cluster.nearest_settlement_km.toFixed(1),
          })}
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="card p-2.5">
          <dt className="text-xs text-muted-foreground">{t("fire.area")}</dt>
          <dd className="tabular font-medium">
            {Math.round(cluster.est_area_ha ?? 0)} {t("common.ha")}
          </dd>
        </div>
        <div className="card p-2.5">
          <dt className="text-xs text-muted-foreground">
            {t("fire.detectionCount")}
          </dt>
          <dd className="tabular font-medium">{cluster.detection_count}</dd>
        </div>
        <div className="card p-2.5">
          <dt className="text-xs text-muted-foreground">{t("fire.peakFrp")}</dt>
          <dd className="tabular font-medium">
            {Math.round(cluster.max_frp_mw ?? 0)} {t("common.mw")}
          </dd>
        </div>
        <div className="card p-2.5">
          <dt className="text-xs text-muted-foreground">
            {t("fire.confidence")}
          </dt>
          <dd className="font-medium">
            <RiskChip
              level={Math.max(1, Math.round(cluster.confidence * 5))}
              showName={false}
            />
          </dd>
        </div>
      </dl>

      <Link
        to="/fire/$id"
        params={{ id: cluster.short_id }}
        className="rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground"
      >
        {t("map.openDetail")}
      </Link>
    </div>
  );
}
