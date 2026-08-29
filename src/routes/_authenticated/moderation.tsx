import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ReportPhoto } from "@/components/ReportPhoto";
import type { Locale } from "@/i18n";
import { clustersQuery, relativeTime } from "@/lib/nadhir";
import {
  moderateReport,
  moderationQueueQuery,
  myRolesQuery,
  type CitizenReport,
  type ReportStatus,
} from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/moderation")({
  head: () => ({
    meta: [
      { title: "Moderation console — Nadhir" },
      {
        name: "description",
        content:
          "Review, approve or reject citizen fire reports submitted to Nadhir moderators.",
      },
      { property: "og:title", content: "Moderation console — Nadhir" },
      {
        property: "og:description",
        content: "Citizen report review queue for Nadhir moderators.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ModerationPage,
});

const FILTERS = ["pending", "approved", "rejected", "all"] as const;
type Filter = (typeof FILTERS)[number];

function ModerationPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const qc = useQueryClient();
  const roles = useQuery(myRolesQuery);
  const isModerator = (roles.data ?? []).some(
    (r) => r === "moderator" || r === "admin",
  );
  const queue = useQuery({ ...moderationQueueQuery, enabled: isModerator });
  const clusters = useQuery({ ...clustersQuery, enabled: isModerator });
  const [filter, setFilter] = useState<Filter>("pending");

  const mutate = useMutation({
    mutationFn: moderateReport,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports"] }),
  });

  if (roles.isLoading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">
        {t("common.loading")}
      </main>
    );
  }

  if (!isModerator) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold">
          {t("admin.title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("admin.noAccess")}
        </p>
      </main>
    );
  }

  const rows = (queue.data ?? []).filter(
    (r) => filter === "all" || r.status === filter,
  );
  const pending = (queue.data ?? []).filter(
    (r) => r.status === "pending",
  ).length;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 className="font-display text-2xl font-semibold">
        {t("admin.title")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("admin.subtitle")}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("admin.pendingCount", { count: pending })}
      </p>
      {(roles.data ?? []).includes("admin") ? (
        <Link
          to="/team"
          className="mt-2 inline-block text-xs text-primary underline underline-offset-2"
        >
          {t("team.title")}
        </Link>
      ) : null}

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
            {t(`admin.filter${f.charAt(0).toUpperCase()}${f.slice(1)}`)}
          </button>
        ))}
      </div>

      {queue.isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">
          {t("common.loading")}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          {t("admin.queueEmpty")}
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
    </main>
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
  const { t } = useTranslation();
  const [note, setNote] = useState(report.moderation_note ?? "");
  const [clusterId, setClusterId] = useState(report.cluster_id ?? "");

  return (
    <li className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
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
          ? ` · ${t("admin.reviewed", { time: relativeTime(report.reviewed_at, locale) })}`
          : ""}
      </p>
      {report.note ? <p className="mt-2 text-sm">{report.note}</p> : null}
      <ReportPhoto photo={report.photo_url} />

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          {t("admin.modNote")}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          {t("admin.linkFire")}
          <select
            value={clusterId}
            onChange={(e) => setClusterId(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          >
            <option value="">{t("admin.linkNone")}</option>
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
          {t("admin.approve")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onModerate("rejected", note.trim() || null, clusterId || null)
          }
          className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-60"
        >
          {t("admin.reject")}
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
            {t("admin.reopen")}
          </button>
        ) : null}
      </div>
    </li>
  );
}
