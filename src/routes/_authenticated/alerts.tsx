import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";

import type { Locale } from "@/i18n";
import {
  alertsQuery,
  deleteAlert,
  markAlertRead,
  markAllAlertsRead,
  type Alert,
} from "@/lib/alerts";
import { runMyAlertCheck } from "@/lib/alerts.functions";
import { zonesQuery } from "@/lib/account";
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
    mutationFn: ({ id, read }: { id: string; read: boolean }) =>
      markAlertRead(id, read),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: deleteAlert,
    onSuccess: invalidate,
  });
  const allReadMutation = useMutation({
    mutationFn: () =>
      markAllAlertsRead(
        (alerts.data ?? []).filter((a) => !a.read_at).map((a) => a.id),
      ),
    onSuccess: invalidate,
  });
  const checkMutation = useMutation({
    mutationFn: () => check({}),
    onSuccess: invalidate,
  });

  const rows = alerts.data ?? [];
  const unread = rows.filter((a) => !a.read_at).length;
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
          {rows.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              locale={locale}
              zoneName={zoneName(alert.zone_id)}
              onToggleRead={() =>
                readMutation.mutate({ id: alert.id, read: !alert.read_at })
              }
              onDelete={() => deleteMutation.mutate(alert.id)}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function AlertCard({
  alert,
  locale,
  zoneName,
  onToggleRead,
  onDelete,
}: {
  alert: Alert;
  locale: Locale;
  zoneName: string;
  onToggleRead: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const shortId = alert.payload?.short_id;
  return (
    <li
      className={`card p-4 ${alert.read_at ? "opacity-70" : ""}`}
      style={{
        borderInlineStartWidth: 4,
        borderInlineStartColor: riskSolid(alert.severity),
      }}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <RiskChip level={alert.severity} showName={false} />
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
          {t(alert.kind === "fire" ? "alerts.kindFire" : "alerts.kindRisk")}
        </span>
        <h2 className="font-medium">{alert.title}</h2>
        <span className="ms-auto text-xs text-muted-foreground">
          {relativeTime(alert.created_at, locale)}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{alert.body}</p>
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
        ) : null}
        <button
          type="button"
          onClick={onToggleRead}
          className="text-muted-foreground hover:text-foreground"
        >
          {t(alert.read_at ? "alerts.markUnread" : "alerts.markRead")}
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
