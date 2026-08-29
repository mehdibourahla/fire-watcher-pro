import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Wind } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MapCanvas } from "@/components/MapCanvas";
import { DetectionStrip } from "@/components/nadhir/DetectionStrip";
import { StatCard } from "@/components/nadhir/StatCard";
import { EmptyState, Skeleton } from "@/components/nadhir/states";
import { EmergencyNumbers } from "@/components/SiteChrome";
import type { Locale } from "@/i18n";
import { downwindSettlement } from "@/lib/alerts-rules";
import {
  adminUnitsQuery,
  algiersTime,
  bearingBetween,
  bearingLabel,
  clusterDetailQuery,
  haversineKm,
  placeLabel,
  relativeTime,
  settlementsQuery,
  unitName,
} from "@/lib/nadhir";

export const Route = createFileRoute("/fire/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Fire ${params.id} — Nadhir Algeria` },
      {
        name: "description",
        content:
          "Detection timeline, spread direction and nearby settlements for a detected fire in Algeria.",
      },
      { property: "og:title", content: `Fire ${params.id} — Nadhir Algeria` },
      {
        property: "og:description",
        content:
          "Satellite detection timeline and nearby settlements for this fire cluster.",
      },
    ],
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(clusterDetailQuery(params.id)),
  component: FireDetail,
});

function FireDetail() {
  const { id } = Route.useParams();
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const detail = useQuery(clusterDetailQuery(id));
  const units = useQuery(adminUnitsQuery);
  const settlements = useQuery(settlementsQuery);

  if (detail.isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-3 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!detail.data) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <EmptyState
          title={t("fire.notFound")}
          action={
            <Link
              to="/"
              className="mt-2 text-sm font-medium text-primary underline"
            >
              {t("nav.map")}
            </Link>
          }
        />
      </div>
    );
  }

  const { cluster, detections } = detail.data;
  const wilaya = (units.data ?? []).find((u) => u.id === cluster.wilaya_id);
  const place = placeLabel(
    cluster,
    units.data ?? [],
    settlements.data ?? [],
    locale,
  );

  // measured from the nearest detection: a fire reaches a village from its front
  const nearby = (settlements.data ?? [])
    .map((s) => ({
      settlement: s,
      km: detections.length
        ? Math.min(
            ...detections.map((d) => haversineKm(d.lat, d.lon, s.lat, s.lon)),
          )
        : haversineKm(cluster.lat, cluster.lon, s.lat, s.lon),
      bearing: bearingBetween(cluster.lat, cluster.lon, s.lat, s.lon),
    }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 5);

  // named only when the wind actually blows toward it: the nearest settlement is
  // frequently upwind, and an emergency banner pointing the wrong way misdirects
  const downwind = downwindSettlement(
    cluster,
    cluster.spread_bearing_deg,
    (settlements.data ?? []).map((s) => ({ ...s, name: s.name })),
  );

  return (
    <div className="mx-auto grid max-w-[1400px] gap-4 px-4 py-5 lg:grid-cols-[1fr_400px]">
      <div className="flex flex-col gap-4">
        <div>
          <Link
            to="/"
            className="text-sm text-muted-foreground underline underline-offset-2"
          >
            ← {t("common.back")}
          </Link>
          <h1 className="mt-2 text-2xl">
            {place.approximate
              ? t("map.nearPlace", { place: place.name })
              : place.name}
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {wilaya ? <span>{unitName(wilaya, locale)} ·</span> : null}
            <span>{t(`state.${cluster.state}`)}</span>
            <span className="tabular text-xs">· {cluster.short_id}</span>
            <span className="tabular text-xs">
              · {t("fire.confidence")} {Math.round(cluster.confidence * 100)}%
            </span>
          </p>
        </div>

        {cluster.spread_bearing_deg !== null && downwind ? (
          <p
            className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium"
            style={{
              backgroundColor: "var(--emergency-surface)",
              color: "var(--emergency)",
            }}
          >
            <Wind aria-hidden className="size-4 shrink-0" />
            {t("fire.windToward", {
              bearing: bearingLabel(cluster.spread_bearing_deg),
              settlement: downwind.name,
            })}
          </p>
        ) : null}

        <div className="h-[45vh] overflow-hidden rounded-xl border border-border">
          <MapCanvas
            clusters={[cluster]}
            selectedShortId={cluster.short_id}
            center={[cluster.lon, cluster.lat]}
            zoom={10}
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <StatCard
            label={t("fire.area")}
            value={
              cluster.est_area_ha == null
                ? "—"
                : `${Math.round(cluster.est_area_ha)} ${t("common.ha")}`
            }
          />
          <StatCard
            label={t("fire.peakFrp")}
            value={
              cluster.max_frp_mw == null
                ? "—"
                : `${Math.round(cluster.max_frp_mw)} ${t("common.mw")}`
            }
          />
          <StatCard
            label={t("fire.detectionCount")}
            value={cluster.detection_count}
          />
          <StatCard
            label={t("fire.confidence")}
            value={`${Math.round(cluster.confidence * 100)}%`}
          />
          <StatCard
            label={t("fire.firstSeen")}
            value={algiersTime(cluster.first_detected_at)}
          />
          <StatCard
            label={t("fire.lastSeen")}
            value={relativeTime(cluster.last_detected_at, locale)}
          />
          <StatCard
            label={t("fire.wind")}
            value={
              cluster.wind_speed_kmh == null
                ? "—"
                : `${Math.round(cluster.wind_speed_kmh)} ${t("common.kmh")}`
            }
            sub={bearingLabel(cluster.wind_dir_deg)}
          />
          <StatCard
            label={t("map.sources")}
            value={cluster.sources.join(", ").toUpperCase()}
          />
        </div>
      </div>

      <aside className="flex flex-col gap-4">
        <section className="card p-4">
          <h2 className="text-base">{t("fire.timeline")}</h2>
          <DetectionStrip detections={detections} className="mt-3" />
        </section>

        <section className="card p-4">
          <h2 className="text-base">{t("fire.nearest")}</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-start font-normal">
                  {t("fire.settlement")}
                </th>
                <th className="text-end font-normal">{t("fire.distance")}</th>
                <th className="text-end font-normal">{t("fire.bearing")}</th>
              </tr>
            </thead>
            <tbody>
              {nearby.map((n) => (
                <tr key={n.settlement.id} className="border-t border-border">
                  <td className="py-1.5">
                    {locale === "ar"
                      ? (n.settlement.name_ar ?? n.settlement.name)
                      : n.settlement.name}
                  </td>
                  <td className="py-1.5 text-end tabular">
                    {n.km.toFixed(1)} {t("common.km")}
                  </td>
                  <td className="py-1.5 text-end">{bearingLabel(n.bearing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="flex flex-wrap gap-2">
          <Link
            to="/zones"
            className="flex-1 rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground"
          >
            {t("fire.alertMe")}
          </Link>
          <Link
            to="/report"
            className="flex-1 rounded-md border border-border px-3 py-2 text-center text-sm font-medium"
          >
            {t("nav.report")}
          </Link>
        </div>

        <EmergencyNumbers />
      </aside>
    </div>
  );
}
