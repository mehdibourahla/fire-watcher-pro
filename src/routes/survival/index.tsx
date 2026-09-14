import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  CheckCircle2,
  Clock,
  Flame,
  MapPin,
  Phone,
  ShieldCheck,
  Wind,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  deviceStorage,
  persistSurvivalFlag,
  readSurvivalFlag,
} from "@/lib/survival-pack";
import { useSurvival } from "@/components/survival/survival-context";
import type { Locale } from "@/i18n";

import {
  bearingLabel,
  clustersQuery,
  haversineKm,
  relativeTime,
} from "@/lib/nadhir";
import { hazardReportsQuery } from "@/lib/open-areas";
import {
  SURVIVAL_ACTIVE_KEY,
  SURVIVAL_LAST_CHECK_KEY,
  nearestThreat,
} from "@/lib/survival";

export const Route = createFileRoute("/survival/")({
  component: SurvivalHub,
});

const REPORT_KINDS = [
  { kind: "sighting", key: "survival.reportFire" },
  { kind: "smoke", key: "survival.reportSmoke" },
  { kind: "road_blocked", key: "survival.reportRoadBlocked" },
  { kind: "person_trapped", key: "survival.reportPersonTrapped" },
] as const;

function dirWord(t: (k: string) => string, deg: number) {
  return t(`survival.dir.${bearingLabel(deg).toLowerCase()}`);
}

function SurvivalHub() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { online, position, positionDenied, pack } = useSurvival();

  const [active, setActive] = useState(
    () => readSurvivalFlag(deviceStorage, SURVIVAL_ACTIVE_KEY) !== null,
  );
  const [lastCheck] = useState(() =>
    readSurvivalFlag(deviceStorage, SURVIVAL_LAST_CHECK_KEY),
  );
  const [storageFailed, setStorageFailed] = useState(false);

  const clusters = useQuery({
    ...clustersQuery,
    enabled: online,
    retry: online ? 3 : false,
  });
  const hazards = useQuery({
    ...hazardReportsQuery,
    enabled: online,
    retry: online ? 3 : false,
  });

  useEffect(() => {
    if (active)
      persistSurvivalFlag(
        deviceStorage,
        SURVIVAL_LAST_CHECK_KEY,
        new Date().toISOString(),
      );
  }, [active]);

  const threat = useMemo(
    () =>
      position && clusters.data
        ? nearestThreat(position.lat, position.lon, clusters.data)
        : null,
    [position, clusters.data],
  );

  const changes = useMemo(() => {
    if (!lastCheck) return null;
    const fires = (clusters.data ?? []).filter(
      (c) => c.last_detected_at > lastCheck,
    ).length;
    const reports = (hazards.data ?? []).filter(
      (r) => r.created_at > lastCheck,
    ).length;
    if (fires === 0 && reports === 0) return null;
    return { fires, reports };
  }, [lastCheck, clusters.data, hazards.data]);

  // A saved threat was computed for the pack's position. Show it only when live data
  // is unavailable and the user has not moved away from where it was measured.
  const offlineThreat = useMemo(() => {
    const saved = pack?.threats[0];
    if (threat || !saved || clusters.data || !position) return null;
    if (
      position &&
      pack &&
      haversineKm(position.lat, position.lon, pack.lat, pack.lon) > 2
    )
      return null;
    return saved;
  }, [threat, pack, clusters.data, position]);

  if (!active) {
    return (
      <EnterSheet
        hasPosition={!!position}
        denied={positionDenied}
        hasPack={!!pack?.shell_ready}
        onEnter={() => {
          setActive(true);
          setStorageFailed(
            !persistSurvivalFlag(
              deviceStorage,
              SURVIVAL_ACTIVE_KEY,
              new Date().toISOString(),
            ),
          );
        }}
      />
    );
  }

  return (
    <>
      {storageFailed ? (
        <p role="status" className="rounded bg-muted p-3 text-sm">
          {t("survival.packStorageFailed")}
        </p>
      ) : null}
      <section className="card-raised flex flex-col gap-2.5 p-4">
        <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-muted-foreground">
          <ShieldCheck aria-hidden className="size-3.5" />
          {(online
            ? t("survival.guidanceLabel")
            : t("survival.guidanceSaved")
          ).toUpperCase()}
        </span>
        <h1 className="font-display text-3xl leading-tight">
          {t("survival.prepareTitle")}
        </h1>
        <p className="text-[15px] leading-relaxed">
          {t("survival.prepareBody")}
        </p>
        <p className="hairline-0 border-t border-border pt-2.5 text-[13px] leading-relaxed text-muted-foreground">
          {t("survival.prepareNoInstruction")}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[11px] font-bold tracking-wider text-muted-foreground">
          {(online
            ? t("survival.knows")
            : t("survival.lastKnown")
          ).toUpperCase()}
        </h2>

        {threat ? (
          <FactRow
            icon={<Flame aria-hidden className="size-4.5" />}
            tint
            title={t("survival.fireObserved", {
              km: threat.km.toFixed(1),
              bearing: dirWord(t, threat.bearing),
            })}
          >
            <span
              className="tabular rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{
                backgroundColor: "var(--risk-tint-4)",
                color: "var(--risk-ink-4)",
              }}
            >
              {t("survival.seenAgo", {
                time: relativeTime(threat.cluster.last_detected_at, locale),
              })}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {t("survival.bySatellite")}
              {threat.closing ? ` · ${t("survival.closer")}` : ""}
            </span>
          </FactRow>
        ) : offlineThreat ? (
          <FactRow
            icon={<Flame aria-hidden className="size-4.5" />}
            tint
            title={t("survival.fireObserved", {
              km: offlineThreat.km.toFixed(1),
              bearing: dirWord(t, offlineThreat.bearing),
            })}
          >
            <span
              className="tabular rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{
                backgroundColor: "var(--risk-tint-2)",
                color: "var(--risk-ink-2)",
              }}
            >
              {t("survival.seenAgo", {
                time: relativeTime(offlineThreat.last_detected_at, locale),
              })}
            </span>
          </FactRow>
        ) : (
          <p className="card p-3 text-[13px] leading-relaxed text-muted-foreground">
            {positionDenied
              ? t("survival.noPosition")
              : t("survival.noFreshData")}
          </p>
        )}

        {threat?.cluster.wind_speed_kmh != null &&
        threat.cluster.wind_dir_deg != null ? (
          <FactRow
            icon={<Wind aria-hidden className="size-4.5" />}
            title={
              t("survival.wind", {
                kmh: Math.round(threat.cluster.wind_speed_kmh),
                bearing: dirWord(t, threat.cluster.wind_dir_deg),
              }) +
              (threat.cluster.wind_gust_kmh == null
                ? ""
                : ` · ${t("survival.gusts", { kmh: Math.round(threat.cluster.wind_gust_kmh) })}`)
            }
          >
            {threat.closing ? (
              <span className="text-[11px] text-muted-foreground">
                {t("survival.windToward")}
              </span>
            ) : null}
          </FactRow>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {t("survival.smokeUnavailable")}
        </p>

        {changes && lastCheck ? (
          <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            <Clock aria-hidden className="size-3.5 shrink-0" />
            {t("survival.sinceCheck", {
              time: relativeTime(lastCheck, locale),
              fires: changes.fires,
              reports: changes.reports,
            })}
          </p>
        ) : null}
      </section>

      <section className="mt-auto flex flex-col gap-2.5">
        <Link
          to="/survival/sos"
          className="flex h-14 items-center justify-center gap-2.5 rounded-xl text-lg font-bold"
          style={{
            backgroundColor: "var(--emergency)",
            color: "var(--surface)",
          }}
        >
          <Phone aria-hidden className="size-5" />
          {t("survival.sos")} — 14
        </Link>
        <div className="flex gap-2.5">
          <Link
            to="/survival/checkin"
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold"
            style={{
              backgroundColor: "var(--accent-tint)",
              color: "var(--accent)",
            }}
          >
            <CheckCircle2 aria-hidden className="size-4.5" />
            {t("survival.checkinTitle")}
          </Link>
          <Link
            to="/survival/areas"
            className="card flex h-12 flex-1 items-center justify-center gap-2 text-sm font-semibold"
          >
            <MapPin aria-hidden className="size-4.5" />
            {t("survival.areasTitle")}
          </Link>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="shrink-0 text-[11px] font-bold tracking-wider text-muted-foreground">
            {t("survival.report").toUpperCase()}
          </span>
          {REPORT_KINDS.map((c) => (
            <Link
              key={c.kind}
              to="/report"
              search={{ kind: c.kind }}
              className="card shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
            >
              {t(c.key)}
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

function FactRow({
  icon,
  title,
  tint = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tint?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="card flex items-center gap-3 p-3">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full"
        style={
          tint
            ? {
                backgroundColor: "var(--risk-tint-4)",
                color: "var(--risk-ink-4)",
              }
            : { backgroundColor: "var(--raised)", color: "var(--ink-soft)" }
        }
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-semibold">{title}</span>
        <span className="flex flex-wrap items-center gap-1.5">{children}</span>
      </div>
    </div>
  );
}

function EnterSheet({
  onEnter,
  hasPosition,
  denied,
  hasPack,
}: {
  onEnter: () => void;
  hasPosition: boolean;
  denied: boolean;
  hasPack: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50">
      <div className="w-full max-w-xl rounded-t-2xl bg-surface p-5 pb-8 shadow-[var(--shadow-sheet)]">
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-border" />
        <h1 className="font-display text-2xl">{t("survival.enterTitle")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t("survival.enterBody")}
        </p>
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          <MapPin aria-hidden className="size-3.5 shrink-0" />
          {t(
            denied
              ? "survival.enterDenied"
              : !hasPosition
                ? "survival.enterFetching"
                : hasPack
                  ? "survival.enterReady"
                  : "survival.packMissing",
          )}
        </p>
        <button
          type="button"
          onClick={onEnter}
          className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-bold"
          style={{
            backgroundColor: "var(--emergency)",
            color: "var(--surface)",
          }}
        >
          {t("survival.enterYes")}
        </button>
        <Link
          to="/"
          className="mt-2.5 flex h-12 w-full items-center justify-center rounded-xl border border-border text-sm font-semibold text-muted-foreground"
        >
          {t("survival.enterCancel")}
        </Link>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          {t("survival.enterFootnote")}
        </p>
      </div>
    </div>
  );
}
