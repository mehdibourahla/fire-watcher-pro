import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import type { AnyLocale } from "@/i18n";
import { EnsemblePreview } from "@/components/admin/EnsemblePreview";
import { PushDeviceTest } from "@/components/admin/PushDeviceTest";
import { ItaReports } from "@/components/admin/ItaReports";
import {
  acknowledgeIncident,
  deliveryQueueQuery,
  operationalIncidentsQuery,
  setDeliveryChannelPaused,
  type DeliveryChannel,
  openGapsQuery,
  replayGap,
  sourceHealthQuery,
  setSourcePaused,
} from "@/lib/admin-sources";
import { relativeTime } from "@/lib/nadhir";
import { myRolesQuery } from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/admin/sources")({
  component: SourcesPage,
});

const STATE_TONE: Record<string, string> = {
  healthy: "text-muted-foreground",
  degraded: "text-[var(--warning,#b45309)]",
  stale: "text-[var(--emergency)]",
};

function SourcesPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.language as AnyLocale;
  const qc = useQueryClient();
  const health = useQuery(sourceHealthQuery);
  const roles = useQuery(myRolesQuery);
  const isAdmin = !roles.isError && (roles.data ?? []).includes("admin");
  const gaps = useQuery(openGapsQuery);
  const queues = useQuery(deliveryQueueQuery);
  const incidents = useQuery(operationalIncidentsQuery);
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["admin", "sources"] });
  const channel = useMutation({
    mutationFn: ({
      name,
      paused,
    }: {
      name: DeliveryChannel;
      paused: boolean;
    }) => setDeliveryChannelPaused(name, paused),
    onSuccess: refresh,
  });
  const acknowledge = useMutation({
    mutationFn: acknowledgeIncident,
    onSuccess: refresh,
  });
  const source = useMutation({
    mutationFn: ({ key, paused }: { key: string; paused: boolean }) =>
      setSourcePaused(key, paused),
    onSuccess: refresh,
  });

  const replay = useMutation({
    mutationFn: (id: string) => replayGap(id, null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "sources"] }),
  });

  return (
    <section>
      <h1 className="text-lg font-semibold">{t("sources.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("sources.subtitle")}
      </p>

      {[health, gaps, queues, incidents, roles].map((query, index) =>
        query.isError ? (
          <p
            key={index}
            role="alert"
            className="mt-2 text-sm text-[var(--emergency)]"
          >
            {t("sources.loadFailed")}: {query.error.message}
          </p>
        ) : null,
      )}

      <h2 className="mt-6 text-sm font-medium">
        {t("sources.deliveryQueues")}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("sources.pauseHelp")}
      </p>
      {queues.isPending ? (
        <p role="status" className="mt-2 text-sm">
          {t("sources.loading")}
        </p>
      ) : null}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="text-start text-xs text-muted-foreground">
              {[
                "channel",
                "colState",
                "pending",
                "expired",
                "oldestPending",
                "action",
              ].map((key) => (
                <th key={key} scope="col" className="py-1 pe-3 text-start">
                  {t(`sources.${key}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(queues.data ?? []).map((row) => (
              <tr key={row.channel} className="border-t border-border">
                <td className="py-2 pe-3">
                  {row.channel === "fcm" ? t("sources.push") : "Telegram"}
                </td>
                <td className="pe-3">
                  {t(row.paused ? "sources.paused" : "sources.running")}
                </td>
                <td className="pe-3">{row.pending_count}</td>
                <td className="pe-3">{row.expired_count}</td>
                <td className="pe-3">
                  {row.oldest_pending_at
                    ? relativeTime(row.oldest_pending_at, locale)
                    : "—"}
                </td>
                <td>
                  <button
                    type="button"
                    disabled={channel.isPending}
                    onClick={() =>
                      channel.mutate({ name: row.channel, paused: !row.paused })
                    }
                    className="rounded-md border border-border px-3 py-1 text-xs disabled:opacity-50"
                  >
                    {t(row.paused ? "sources.resume" : "sources.pause")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {channel.isError ? (
        <p role="alert" className="mt-2 text-sm text-[var(--emergency)]">
          {t("sources.actionFailed")}: {channel.error.message}
        </p>
      ) : null}

      <h2 className="mt-8 text-sm font-medium">
        {t("sources.operationalIncidents")}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("sources.incidentsHelp")}
      </p>
      {incidents.isPending ? (
        <p role="status" className="mt-2 text-sm">
          {t("sources.loading")}
        </p>
      ) : null}
      {incidents.isSuccess && !incidents.data.length ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("sources.incidentsEmpty")}
        </p>
      ) : null}
      <ul className="mt-2 space-y-2">
        {(incidents.data ?? []).map((incident) => (
          <li
            key={incident.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
          >
            <div>
              <p>
                {incident.contract_key} · {incident.reason_code}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("sources.firstSeen")}:{" "}
                {relativeTime(incident.first_seen_at, locale)} ·{" "}
                {t("sources.lastSeen")}:{" "}
                {relativeTime(incident.last_seen_at, locale)}
              </p>
              <p className="text-xs">
                {t(
                  incident.resolved_at
                    ? "sources.resolved"
                    : incident.acknowledged_at
                      ? "sources.acknowledged"
                      : "sources.open",
                )}
                {incident.acknowledged_at
                  ? ` · ${relativeTime(incident.acknowledged_at, locale)}`
                  : ""}
              </p>
            </div>
            {!incident.resolved_at && !incident.acknowledged_at ? (
              <button
                type="button"
                disabled={acknowledge.isPending}
                onClick={() => acknowledge.mutate(incident.id)}
                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {t("sources.acknowledge")}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {acknowledge.isError ? (
        <p role="alert" className="mt-2 text-sm text-[var(--emergency)]">
          {t("sources.actionFailed")}: {acknowledge.error.message}
        </p>
      ) : null}

      <ItaReports />
      <PushDeviceTest />
      <EnsemblePreview />

      <h2 className="mt-6 text-sm font-medium">{t("sources.health")}</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("sources.sourcePauseHelp")}
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 pr-3">{t("sources.colSource")}</th>
              <th className="py-1 pr-3">{t("sources.colState")}</th>
              <th className="py-1 pr-3">{t("sources.colCriticality")}</th>
              <th className="py-1">{t("sources.colLastSuccess")}</th>
              {isAdmin ? <th className="py-1">{t("sources.action")}</th> : null}
            </tr>
          </thead>
          <tbody>
            {(health.data ?? []).map((row) => (
              <tr key={row.key ?? ""} className="border-t border-border">
                <td className="py-1.5 pr-3">{row.label ?? row.key}</td>
                <td
                  className={`py-1.5 pr-3 ${STATE_TONE[row.state ?? ""] ?? ""}`}
                >
                  {row.state}
                </td>
                <td className="py-1.5 pr-3 text-muted-foreground">
                  {row.criticality}
                </td>
                <td className="py-1.5 text-muted-foreground">
                  {row.last_success_at
                    ? relativeTime(row.last_success_at, locale)
                    : "—"}
                </td>
                {isAdmin ? (
                  <td className="py-1.5">
                    <button
                      type="button"
                      disabled={source.isPending || !row.key}
                      aria-label={t(
                        row.enabled
                          ? "sources.pauseSource"
                          : "sources.resumeSource",
                        { source: row.label ?? row.key },
                      )}
                      onClick={() =>
                        row.key &&
                        source.mutate({ key: row.key, paused: row.enabled })
                      }
                      className="rounded-md border border-border px-3 py-1 text-xs disabled:opacity-50"
                    >
                      {t(row.enabled ? "sources.pause" : "sources.resume")}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {source.isError ? (
        <p role="alert" className="mt-2 text-sm text-[var(--emergency)]">
          {t("sources.actionFailed")}: {source.error.message}
        </p>
      ) : null}

      <h2 className="mt-8 text-sm font-medium">{t("sources.gaps")}</h2>
      {gaps.isSuccess && gaps.data.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("sources.gapsEmpty")}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {(gaps.data ?? []).map((gap) => (
            <li
              key={gap.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span>
                {gap.contract_key}
                <span className="ml-2 text-xs text-muted-foreground">
                  {gap.state} ·{" "}
                  {t("sources.replayCount", { count: gap.replay_count })}
                </span>
              </span>
              <button
                type="button"
                disabled={replay.isPending}
                onClick={() => replay.mutate(gap.id)}
                className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {t("sources.replay")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {replay.isError ? (
        <p className="mt-2 text-xs text-[var(--emergency)]">
          {(replay.error as Error).message}
        </p>
      ) : null}
    </section>
  );
}
