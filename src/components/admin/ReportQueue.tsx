import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ReportPhoto } from "@/components/ReportPhoto";
import type { Locale } from "@/i18n";
import { clustersQuery, relativeTime } from "@/lib/nadhir";
import {
  moderateReport,
  moderationQueueQuery,
  type CitizenReport,
  type ReportStatus,
} from "@/lib/reports";

const FILTERS = ["pending", "approved", "rejected", "all"] as const;
type Filter = (typeof FILTERS)[number];

export function ReportQueue({ locale }: { locale: Locale }) {
  const { t } = useTranslation("admin");
  const qc = useQueryClient();
  const queue = useQuery(moderationQueueQuery);
  const clusters = useQuery(clustersQuery);
  const [filter, setFilter] = useState<Filter>("pending");

  const mutate = useMutation({
    mutationFn: moderateReport,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });

  const rows = (queue.data ?? []).filter(
    (r) => filter === "all" || r.status === filter,
  );

  return (
    <div>
      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={
              filter === f
                ? "rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                : "rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground"
            }
          >
            {t(`queues.filter${f.charAt(0).toUpperCase()}${f.slice(1)}`)}
          </button>
        ))}
      </div>

      {queue.isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">
          {t("queues.loading")}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          {t("queues.queueEmpty")}
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((report) => (
            <QueueCard
              key={report.id}
              report={report}
              locale={locale}
              clusters={(clusters.data ?? []).map((c) => ({
                id: c.id,
                short_id: c.short_id,
              }))}
              busy={mutate.isPending}
              onModerate={(status, note, clusterId) =>
                mutate.mutate({
                  id: report.id,
                  status,
                  moderation_note: note,
                  cluster_id: clusterId,
                })
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function QueueCard({
  report,
  locale,
  clusters,
  busy,
  onModerate,
}: {
  report: CitizenReport;
  locale: Locale;
  clusters: { id: string; short_id: string }[];
  busy: boolean;
  onModerate: (
    status: ReportStatus,
    note: string | null,
    clusterId: string | null,
  ) => void;
}) {
  const { t } = useTranslation("admin");
  const [note, setNote] = useState(report.moderation_note ?? "");
  const [clusterId, setClusterId] = useState(report.cluster_id ?? "");

  return (
    <li className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {report.kind !== "sighting" ? (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{
              backgroundColor: "var(--emergency-surface)",
              color: "var(--emergency)",
            }}
          >
            {t(
              report.kind === "road_blocked"
                ? "survival.reportRoadBlocked"
                : "survival.reportPersonTrapped",
            )}
          </span>
        ) : null}
        <span className="font-medium">
          {t(
            `reports.sighting${report.sighting.charAt(0).toUpperCase()}${report.sighting.slice(1)}`,
          )}{" "}
          ·{" "}
          {t(
            `reports.size${report.size_hint.charAt(0).toUpperCase()}${report.size_hint.slice(1)}`,
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          {relativeTime(report.observed_at, locale)}
        </span>
        <span className="ms-auto rounded-full border border-border px-2 py-0.5 text-xs">
          {t(
            report.status === "approved"
              ? "reports.statusApproved"
              : report.status === "rejected"
                ? "reports.statusRejected"
                : "reports.statusPending",
          )}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {report.lat.toFixed(3)}, {report.lon.toFixed(3)}
        {report.reviewed_at
          ? ` · ${t("queues.reviewed", { time: relativeTime(report.reviewed_at, locale) })}`
          : ""}
      </p>
      {report.note ? <p className="mt-2 text-sm">{report.note}</p> : null}
      <ReportPhoto photo={report.photo_url} />

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          {t("queues.modNote")}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          {t("queues.linkFire")}
          <select
            value={clusterId}
            onChange={(e) => setClusterId(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          >
            <option value="">{t("queues.linkNone")}</option>
            {clusters.slice(0, 200).map((c) => (
              <option key={c.id} value={c.id}>
                {c.short_id}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onModerate("approved", note.trim() || null, clusterId || null)
          }
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {t("queues.approve")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onModerate("rejected", note.trim() || null, clusterId || null)
          }
          className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-60"
        >
          {t("queues.reject")}
        </button>
        {report.status !== "pending" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onModerate("pending", note.trim() || null, clusterId || null)
            }
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground disabled:opacity-60"
          >
            {t("queues.reopen")}
          </button>
        ) : null}
      </div>
    </li>
  );
}
