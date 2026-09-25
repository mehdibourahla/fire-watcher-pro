import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";

import type { Locale } from "@/i18n";
import {
  alertFiresQuery,
  alertsQuery,
  deleteAlerts,
  markAlertsRead,
  type Alert,
} from "@/lib/alerts";
import { groupAlerts, groupPhase, type AlertGroup } from "@/lib/alert-groups";
import type { Phase } from "@/lib/incident-lifecycle";
import { runMyAlertCheck } from "@/lib/alerts.functions";
import { isDefaultPoint, zonesQuery } from "@/lib/account";
import { RiskChip } from "@/components/nadhir/RiskChip";
import { riskSolid } from "@/components/nadhir/risk-visuals";
import { relativeTime } from "@/lib/nadhir";
import { titledMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({
    meta: [
      ...titledMeta("alerts.title", "alerts.subtitle"),
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AlertsPage,
});

function AlertsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const qc = useQueryClient();
  const alerts = useQuery(alertsQuery);
  const zones = useQuery(zonesQuery);
  const check = useServerFn(runMyAlertCheck);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["alerts"] });
  const readMutation = useMutation({
    mutationFn: ({ ids, read }: { ids: string[]; read: boolean }) =>
      markAlertsRead(ids, read),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: deleteAlerts,
    onSuccess: invalidate,
  });
  const allReadMutation = useMutation({
    mutationFn: () =>
      markAlertsRead(
        (alerts.data ?? []).filter((a) => !a.read_at).map((a) => a.id),
        true,
      ),
    onSuccess: invalidate,
  });
  const checkMutation = useMutation({
    mutationFn: () => check({}),
    onSuccess: invalidate,
  });

  const rows = alerts.data ?? [];
  const unread = rows.filter((a) => !a.read_at).length;
  const groups = groupAlerts(rows);
  const fires = useQuery(
    alertFiresQuery(
      rows.flatMap((a) =>
        a.kind === "fire" && a.cluster_id ? [a.cluster_id] : [],
      ),
    ),
  );
  const now = Date.now();
  const zoneName = (id: string | null) =>
    zones.data?.find((z) => z.id === id)?.name ?? "";

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="font-display text-2xl font-semibold">
        {t("alerts.title")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("alerts.subtitle")}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => checkMutation.mutate()}
          disabled={checkMutation.isPending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {checkMutation.isPending
            ? t("alerts.checking")
            : t("alerts.checkNow")}
        </button>
        <button
          type="button"
          onClick={() => allReadMutation.mutate()}
          disabled={!unread}
          className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {t("alerts.markAllRead")}
        </button>
        <span className="text-xs text-muted-foreground">
          {t("alerts.unread", { count: unread })}
        </span>
      </div>

      {(zones.data ?? []).some(isDefaultPoint) ? (
        <div
          role="alert"
          className="mt-6 rounded-lg px-4 py-3 text-sm"
          style={{
            backgroundColor: "var(--emergency-surface)",
            color: "var(--emergency-ink)",
          }}
        >
          <p>{t("alerts.defaultPointZones")}</p>
          <Link to="/zones" className="mt-1 inline-block font-medium underline">
            {t("alerts.fixZones")}
          </Link>
        </div>
      ) : null}

      {alerts.isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">
          {t("common.loading")}
        </p>
      ) : rows.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">{t("alerts.empty")}</p>
          <Link
            to="/zones"
            className="mt-2 inline-block text-sm font-medium text-primary"
          >
            {t("alerts.manageZones")}
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {groups.map((group) => (
            <AlertCard
              key={group.key}
              group={group}
              phase={groupPhase(group, fires.data ?? new Map(), now)}
              locale={locale}
              zoneName={zoneName(group.latest.zone_id)}
              onToggleRead={() =>
                readMutation.mutate({
                  ids: group.messages.map((m) => m.id),
                  read: group.unread > 0,
                })
              }
              onDelete={() =>
                deleteMutation.mutate(group.messages.map((m) => m.id))
              }
            />
          ))}
        </ul>
      )}
    </main>
  );
}

const KIND_LABEL: Record<Alert["kind"], string> = {
  fire: "alerts.kindFire",
  risk: "alerts.kindRisk",
  weather: "alerts.kindWeather",
  official: "alerts.kindOfficial",
  road: "alerts.kindRoad",
  citizen: "alerts.kindCitizen",
};

function AlertCard({
  group,
  phase,
  locale,
  zoneName,
  onToggleRead,
  onDelete,
}: {
  group: AlertGroup;
  phase: Phase;
  locale: Locale;
  zoneName: string;
  onToggleRead: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const alert = group.latest;
  const shortId = alert.payload?.short_id;
  const earlier = group.messages.slice(1);
  const mapEvent = alert.payload?.map_event;
  const state =
    alert.kind === "risk"
      ? phase === "live"
        ? "alerts.stateToday"
        : "alerts.statePastForecast"
      : alert.kind !== "fire"
        ? phase === "live"
          ? "alerts.stateCurrentNotice"
          : "alerts.stateNoticeOver"
        : phase === "live"
          ? "alerts.stateLive"
          : phase === "fading"
            ? "civilMap.quiet"
            : phase === "ended"
              ? "civilMap.ended"
              : "civilMap.archived";
  return (
    <li
      className={`card p-4 ${group.unread ? "" : "opacity-70"}`}
      style={{
        borderInlineStartWidth: 4,
        borderInlineStartColor:
          phase === "live" ? riskSolid(alert.severity) : "var(--border)",
      }}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <RiskChip level={alert.severity} showName={false} />
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
          {t(KIND_LABEL[alert.kind])}
        </span>
        <h2 className="font-medium">{alert.title}</h2>
        <span className="ms-auto text-xs text-muted-foreground">
          {relativeTime(alert.created_at, locale)}
        </span>
      </div>
      <p className="mt-1 text-sm font-medium">{t(state)}</p>
      <p className="mt-1 text-sm text-muted-foreground">{alert.body}</p>
      {earlier.length ? (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            {t("alerts.earlier", { count: earlier.length })}
          </summary>
          <ul className="mt-1 space-y-1">
            {earlier.map((message) => (
              <li key={message.id}>
                <time dateTime={message.created_at}>
                  {relativeTime(message.created_at, locale)}
                </time>{" "}
                · {message.title}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        {zoneName ? (
          <span className="text-muted-foreground">{zoneName}</span>
        ) : null}
        {shortId ? (
          <Link
            to="/fire/$id"
            params={{ id: shortId }}
            className="font-medium text-primary"
          >
            {t("alerts.openFire")}
          </Link>
        ) : mapEvent ? (
          <Link
            to="/"
            search={{ event: mapEvent }}
            className="font-medium text-primary"
          >
            {t("alerts.openMap")}
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onToggleRead}
          className="text-muted-foreground hover:text-foreground"
        >
          {t(group.unread ? "alerts.markRead" : "alerts.markUnread")}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive"
        >
          {t("common.delete")}
        </button>
      </div>
    </li>
  );
}
