import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, Flame, LifeBuoy, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { MapLayers } from "@/components/FireMap";
import { MapCanvas } from "@/components/MapCanvas";
import { DangerScale } from "@/components/nadhir/DangerScale";
import { Explain } from "@/components/nadhir/Explain";
import { DetailSheet } from "@/components/nadhir/DetailSheet";
import { LayerToggle } from "@/components/nadhir/LayerToggle";
import { riskSolid } from "@/components/nadhir/risk-visuals";
import { BroadcastBanner } from "@/components/nadhir/BroadcastBanner";
import { SubscribeInvite } from "@/components/nadhir/SubscribeSheet";
import { EmptyState, SkeletonList } from "@/components/nadhir/states";
import {
  DegradedBanner,
  EmergencyNumbers,
  RiskLegend,
} from "@/components/SiteChrome";
import type { Locale } from "@/i18n";
import { alertsQuery } from "@/lib/alerts";
import { pageMeta } from "@/lib/page-meta";
import {
  LIVE_STATES,
  adminUnitsQuery,
  clustersQuery,
  dangerLevelKey,
  sourceHealthQuery,
  relativeTime,
  riskForecastsQuery,
  settlementsQuery,
  placeLabel,
  unitName,
  type FireCluster,
} from "@/lib/nadhir";
import { sourceHealthCapabilityAffected } from "@/lib/source-health";
import {
  SURVIVAL_ACTIVE_KEY,
  SURVIVAL_AUTO_KM,
  SURVIVAL_DISMISS_KEY,
  nearestThreat,
} from "@/lib/survival";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: pageMeta("map.metaTitle", "map.metaDescription"),
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(clustersQuery),
      context.queryClient.ensureQueryData(adminUnitsQuery),
      context.queryClient.ensureQueryData(riskForecastsQuery),
    ]),
  component: LiveMapPage,
});

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
    industrialSources: false,
  });
  const [railSearch, setRailSearch] = useState("");

  const clusters = useQuery(clustersQuery);
  const units = useQuery(adminUnitsQuery);
  const risk = useQuery(riskForecastsQuery);
  const settlements = useQuery(settlementsQuery);
  const sources = useQuery(sourceHealthQuery);
  const alerts = useQuery({ ...alertsQuery, retry: false });
  const navigate = useNavigate();

  const [interstitial, setInterstitial] = useState<{
    km: number;
    seen: string;
  } | null>(null);

  useEffect(() => {
    const data = clusters.data;
    if (!data || typeof navigator === "undefined") return;
    if (!("permissions" in navigator) || !("geolocation" in navigator)) return;
    if (localStorage.getItem(SURVIVAL_ACTIVE_KEY)) return;
    if (sessionStorage.getItem(SURVIVAL_DISMISS_KEY)) return;
    let cancelled = false;
    // Only an already-granted permission is used: the map never prompts for location.
    void navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (cancelled || status.state !== "granted") return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (cancelled) return;
            const threat = nearestThreat(
              pos.coords.latitude,
              pos.coords.longitude,
              data,
            );
            if (
              threat &&
              threat.cluster.state === "active" &&
              threat.km <= SURVIVAL_AUTO_KM
            )
              setInterstitial({
                km: threat.km,
                seen: threat.cluster.last_detected_at,
              });
          },
          () => undefined,
          { timeout: 10000, maximumAge: 300000 },
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [clusters.data]);

  const zoneAlert = useMemo(
    () =>
      (alerts.data ?? []).find((a) => a.kind === "fire" && !a.read_at) ?? null,
    [alerts.data],
  );

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
    const today = (risk.data ?? []).filter(
      (r) => r.horizon_days === 0 && !r.fuel_limited,
    );
    return today.reduce(
      (acc, r) =>
        r.danger_level > acc.level
          ? { level: r.danger_level, fwi: r.fwi }
          : acc,
      { level: 1, fwi: 0 },
    );
  }, [risk.data]);

  const degraded = sourceHealthCapabilityAffected(
    sources.data ?? [],
    sources.isError,
  );

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

  const labelFor = (cluster: FireCluster) =>
    placeLabel(cluster, units.data ?? [], settlements.data ?? [], locale);

  const wilayaById = useMemo(
    () =>
      new Map(
        (units.data ?? [])
          .filter((u) => u.level === "wilaya")
          .map((u) => [u.id, u]),
      ),
    [units.data],
  );

  const railQ = railSearch.trim().toLowerCase();

  const searched = useMemo(() => {
    if (!railQ) return sorted;
    return sorted.filter((c) => {
      const wilaya = c.wilaya_id ? wilayaById.get(c.wilaya_id) : undefined;
      const settlement = c.nearest_settlement_id
        ? settlementById.get(c.nearest_settlement_id)
        : undefined;
      return [
        labelFor(c).name,
        wilaya ? unitName(wilaya, locale) : null,
        wilaya?.name_ar,
        wilaya?.name_fr,
        wilaya?.name_en,
        settlement?.name,
      ]
        .filter(Boolean)
        .some((n) => n!.toLowerCase().includes(railQ));
    });
    // labelFor closes over the same query data listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sorted,
    railQ,
    wilayaById,
    settlementById,
    locale,
    units.data,
    settlements.data,
  ]);

  const fireGroups = useMemo(() => {
    const byWilaya = new Map<string, FireCluster[]>();
    const unassigned: FireCluster[] = [];
    for (const c of sorted) {
      const w = c.wilaya_id ? wilayaById.get(c.wilaya_id) : undefined;
      if (!w) {
        unassigned.push(c);
        continue;
      }
      const list = byWilaya.get(w.id);
      if (list) list.push(c);
      else byWilaya.set(w.id, [c]);
    }
    const active = (fires: FireCluster[]) =>
      fires.filter((f) => f.state === "active").length;
    const groups = [...byWilaya.entries()].map(([id, fires]) => ({
      wilaya: wilayaById.get(id)!,
      fires,
    }));
    groups.sort(
      (a, b) =>
        active(b.fires) - active(a.fires) || b.fires.length - a.fires.length,
    );
    return { groups, unassigned };
  }, [sorted, wilayaById]);

  const selectedCluster = live.find((c) => c.short_id === selected) ?? null;

  const renderFire = (cluster: FireCluster) => {
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
                backgroundColor: riskSolid(cluster.state === "active" ? 4 : 3),
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
          <Explain text={t("explain.area")}>
            <span className="tabular">
              {cluster.est_area_ha == null
                ? "—"
                : `${Math.round(cluster.est_area_ha)} ${t("common.ha")}`}
            </span>
          </Explain>
          <Explain text={t("explain.detections")}>
            <span className="tabular">
              {cluster.detection_count} {t("map.detections")}
            </span>
          </Explain>
          {settlement && cluster.nearest_settlement_km !== null ? (
            <span className="tabular">
              {settlement.name} · {cluster.nearest_settlement_km.toFixed(1)}{" "}
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
  };

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4 lg:h-[calc(100vh-3.5rem)] lg:flex-row">
      <aside className="order-2 flex w-full shrink-0 flex-col gap-3 lg:order-1 lg:w-[360px] lg:overflow-y-auto">
        <SubscribeInvite />
        <BroadcastBanner />
        {zoneAlert ? (
          <section
            className="flex flex-col gap-2 rounded-xl border p-3"
            style={{
              backgroundColor: "var(--emergency-surface)",
              borderColor: "var(--emergency)",
            }}
          >
            <p
              className="text-sm font-semibold"
              style={{ color: "var(--emergency)" }}
            >
              {zoneAlert.title}
            </p>
            <p className="text-xs" style={{ color: "var(--emergency)" }}>
              {t("survival.zoneElsewhere")}
            </p>
            <div className="flex gap-2">
              {zoneAlert.payload?.short_id ? (
                <Link
                  to="/fire/$id"
                  params={{ id: zoneAlert.payload.short_id }}
                  className="flex-1 rounded-full py-1.5 text-center text-xs font-bold"
                  style={{
                    backgroundColor: "var(--emergency)",
                    color: "var(--surface)",
                  }}
                >
                  {t("survival.zoneView")}
                </Link>
              ) : null}
              <Link
                to="/survival"
                className="flex-1 rounded-full border py-1.5 text-center text-xs font-bold"
                style={{
                  borderColor: "var(--emergency)",
                  color: "var(--emergency)",
                }}
              >
                {t("survival.zoneImHere")}
              </Link>
            </div>
          </section>
        ) : null}

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

        {sorted.length > 0 ? (
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              style={{ insetInlineStart: "0.75rem" }}
            />
            <input
              value={railSearch}
              onChange={(e) => setRailSearch(e.target.value)}
              placeholder={t("map.searchFires")}
              aria-label={t("map.searchFires")}
              className="w-full rounded-lg border border-border bg-surface py-2 pe-3 ps-9 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        ) : null}

        <section className="card">
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
          ) : railQ ? (
            searched.length === 0 ? (
              <EmptyState title={t("risk.noResults")} className="border-0" />
            ) : (
              <div className="divide-y divide-border">
                {searched.map((cluster) => renderFire(cluster))}
              </div>
            )
          ) : (
            <div className="divide-y divide-border">
              {fireGroups.groups.map(({ wilaya, fires }) => (
                <details key={wilaya.id}>
                  <summary className="flex cursor-pointer list-none items-center gap-2 bg-muted/50 px-3 py-2 [&::-webkit-details-marker]:hidden">
                    <ChevronDown
                      aria-hidden
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                    <span className="flex-1 text-sm font-semibold">
                      {unitName(wilaya, locale)}
                    </span>
                    <span className="tabular text-xs text-muted-foreground">
                      {t("map.fireCount", { count: fires.length })}
                    </span>
                  </summary>
                  <div className="divide-y divide-border">
                    {fires.map((cluster) => renderFire(cluster))}
                  </div>
                </details>
              ))}
              {fireGroups.unassigned.length > 0 ? (
                <details>
                  <summary className="flex cursor-pointer list-none items-center gap-2 bg-muted/50 px-3 py-2 [&::-webkit-details-marker]:hidden">
                    <ChevronDown
                      aria-hidden
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                    <span className="flex-1 text-sm font-semibold">
                      {t("map.unassigned")}
                    </span>
                    <span className="tabular text-xs text-muted-foreground">
                      {t("map.fireCount", {
                        count: fireGroups.unassigned.length,
                      })}
                    </span>
                  </summary>
                  <div className="divide-y divide-border">
                    {fireGroups.unassigned.map((cluster) =>
                      renderFire(cluster),
                    )}
                  </div>
                </details>
              ) : null}
            </div>
          )}
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
        <Link
          to="/survival"
          className="absolute bottom-4 end-3 z-10 flex items-center gap-2 rounded-full border-2 bg-surface px-4 py-2.5 text-sm font-bold shadow-lg"
          style={{ borderColor: "var(--emergency)", color: "var(--emergency)" }}
        >
          <LifeBuoy aria-hidden className="size-4" />
          {t("survival.pill")}
        </Link>
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

      {interstitial ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-surface">
          <div
            className="h-1.5"
            style={{ backgroundColor: "var(--emergency)" }}
          />
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-6">
            <span
              className="flex size-16 items-center justify-center rounded-full"
              style={{ backgroundColor: "var(--emergency-surface)" }}
            >
              <Flame
                aria-hidden
                className="size-8"
                style={{ color: "var(--emergency)" }}
              />
            </span>
            <h2 className="font-display text-3xl leading-tight">
              {t("survival.interTitle")}
            </h2>
            <p className="text-[15px] leading-relaxed">
              {t("survival.interBody", { km: interstitial.km.toFixed(1) })}
            </p>
            <dl className="card flex flex-col gap-1.5 p-3 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  {t("survival.interBasedOn")}
                </dt>
                <dd className="font-semibold">{t("survival.interPosition")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  {t("survival.interObservation")}
                </dt>
                <dd className="font-semibold">
                  {t("survival.interSatellite", {
                    time: relativeTime(interstitial.seen, locale),
                  })}
                </dd>
              </div>
            </dl>
          </div>
          <div className="mx-auto flex w-full max-w-md flex-col gap-2.5 px-6 pb-8">
            <button
              type="button"
              onClick={() => {
                localStorage.setItem(
                  SURVIVAL_ACTIVE_KEY,
                  new Date().toISOString(),
                );
                void navigate({ to: "/survival" });
              }}
              className="flex h-14 items-center justify-center gap-2 rounded-xl text-base font-bold"
              style={{
                backgroundColor: "var(--emergency)",
                color: "var(--surface)",
              }}
            >
              {t("survival.interEnter")}
            </button>
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem(SURVIVAL_DISMISS_KEY, "1");
                setInterstitial(null);
              }}
              className="flex h-12 items-center justify-center rounded-xl border border-border text-sm font-semibold text-muted-foreground"
            >
              {t("survival.interNotHere")}
            </button>
          </div>
        </div>
      ) : null}
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
        <Explain text={t("explain.area")}>
          <div className="card p-2.5">
            <dt className="text-xs text-muted-foreground">{t("fire.area")}</dt>
            <dd className="tabular font-medium">
              {cluster.est_area_ha == null
                ? "—"
                : `${Math.round(cluster.est_area_ha)} ${t("common.ha")}`}
            </dd>
          </div>
        </Explain>
        <Explain text={t("explain.detections")}>
          <div className="card p-2.5">
            <dt className="text-xs text-muted-foreground">
              {t("fire.detectionCount")}
            </dt>
            <dd className="tabular font-medium">{cluster.detection_count}</dd>
          </div>
        </Explain>
        <Explain text={t("explain.frp")}>
          <div className="card p-2.5">
            <dt className="text-xs text-muted-foreground">
              {t("fire.peakFrp")}
            </dt>
            <dd className="tabular font-medium">
              {cluster.max_frp_mw == null
                ? "—"
                : `${Math.round(cluster.max_frp_mw)} ${t("common.mw")}`}
            </dd>
          </div>
        </Explain>
        <Explain text={t("explain.confidence")}>
          <div className="card p-2.5">
            <dt className="text-xs text-muted-foreground">
              {t("fire.confidence")}
            </dt>
            <dd className="font-medium">
              <span className="tabular">
                {Math.round(cluster.confidence * 100)}%
              </span>
            </dd>
          </div>
        </Explain>
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
