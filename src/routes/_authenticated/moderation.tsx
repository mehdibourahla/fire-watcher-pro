import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ReportPhoto } from "@/components/ReportPhoto";
import type { Locale } from "@/i18n";
import {
  ideaQueueQuery,
  moderateIdea,
  type IdeaStatus,
} from "@/lib/contribute";
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
  const [tab, setTab] = useState<"reports" | "ideas">("reports");

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

      <div className="mt-5 flex flex-wrap gap-2 border-b border-border pb-4">
        <button
          type="button"
          onClick={() => setTab("reports")}
          aria-pressed={tab === "reports"}
          className={
            tab === "reports"
              ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
              : "rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground"
          }
        >
          {t("admin.tabReports")}
        </button>
        <button
          type="button"
          onClick={() => setTab("ideas")}
          aria-pressed={tab === "ideas"}
          className={
            tab === "ideas"
              ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
              : "rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground"
          }
        >
          {t("admin.tabIdeas")}
        </button>
      </div>

      {tab === "ideas" ? <IdeaQueue locale={locale} /> : null}

      <div hidden={tab !== "reports"} className="mt-4 flex flex-wrap gap-2">
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

      {tab !== "reports" ? null : queue.isLoading ? (
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

function laneKey(lane: string) {
  return `contribute.lane${lane.charAt(0).toUpperCase()}${lane.slice(1)}`;
}

function IdeaQueue({ locale }: { locale: Locale }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const queue = useQuery(ideaQueueQuery);
  const [filter, setFilter] = useState<IdeaStatus>("pending");

  const act = useMutation({
    mutationFn: ({ id, status }: { id: string; status: IdeaStatus }) =>
      moderateIdea(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contribution-ideas"] }),
  });

  const rows = (queue.data ?? []).filter((i) => i.status === filter);
  const countOf = (s: IdeaStatus) =>
    (queue.data ?? []).filter((i) => i.status === s).length;

  const filters: { key: IdeaStatus; label: string }[] = [
    { key: "pending", label: t("admin.filterPending") },
    { key: "published", label: t("admin.filterPublished") },
    { key: "rejected", label: t("admin.filterRejected") },
    { key: "spam", label: t("admin.filterSpam") },
  ];

  return (
    <section className="mt-4">
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={
              filter === f.key
                ? "rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                : "rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground"
            }
          >
            {f.label} ({countOf(f.key)})
          </button>
        ))}
      </div>

      {queue.isLoading ? (
        <p className="mt-8 text-sm text-muted-foreground">
          {t("common.loading")}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          {t("admin.ideasEmpty")}
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((idea) => (
            <li key={idea.id} className="card flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-md bg-[var(--accent-tint)] px-2 py-0.5 font-semibold uppercase tracking-wider text-[var(--accent)]">
                  {t(laneKey(idea.lane))}
                </span>
                <span>{relativeTime(idea.created_at, locale)}</span>
                <span aria-hidden>·</span>
                <span>
                  {idea.contact ? t("admin.contactLeft") : t("admin.noContact")}
                </span>
                <span aria-hidden>·</span>
                <span>{idea.locale}</span>
              </div>

              <p className="whitespace-pre-line text-sm leading-relaxed">
                {idea.message}
              </p>

              {idea.contact ? (
                <p className="text-xs text-muted-foreground">{idea.contact}</p>
              ) : null}

              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                {idea.status === "published" ? (
                  <button
                    type="button"
                    disabled={act.isPending}
                    onClick={() =>
                      act.mutate({ id: idea.id, status: "pending" })
                    }
                    className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    {t("admin.unpublish")}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={act.isPending}
                    onClick={() =>
                      act.mutate({ id: idea.id, status: "published" })
                    }
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {t("admin.publish")}
                  </button>
                )}
                <button
                  type="button"
                  disabled={act.isPending}
                  onClick={() =>
                    act.mutate({ id: idea.id, status: "rejected" })
                  }
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-[var(--emergency)] disabled:opacity-50"
                >
                  {t("admin.reject")}
                </button>
                <button
                  type="button"
                  disabled={act.isPending}
                  onClick={() => act.mutate({ id: idea.id, status: "spam" })}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-[var(--emergency)] disabled:opacity-50"
                >
                  {t("admin.spam")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
