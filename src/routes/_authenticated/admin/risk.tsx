import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { AnyLocale } from "@/i18n";
import {
  discardSnapshot,
  publicationCheckpointsQuery,
  publishSnapshot,
  snapshotRunsQuery,
  type SnapshotRun,
} from "@/lib/admin-risk";
import { relativeTime } from "@/lib/nadhir";

export const Route = createFileRoute("/_authenticated/admin/risk")({
  component: RiskPage,
});

function RiskPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.language as AnyLocale;
  const qc = useQueryClient();
  const runs = useQuery(snapshotRunsQuery);
  const checkpoints = useQuery(publicationCheckpointsQuery);
  const [reason, setReason] = useState("");

  const publish = useMutation({
    mutationFn: publishSnapshot,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "risk"] }),
  });
  const discard = useMutation({
    mutationFn: (run: SnapshotRun) => discardSnapshot(run, reason),
    onSuccess: () => {
      setReason("");
      void qc.invalidateQueries({ queryKey: ["admin", "risk"] });
    },
  });

  const error = (publish.error ?? discard.error) as Error | null;

  return (
    <section>
      <h1 className="text-lg font-semibold">{t("risk.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("risk.subtitle")}</p>

      <h2 className="mt-6 text-sm font-medium">{t("risk.lastPublished")}</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {(checkpoints.data ?? []).slice(0, 3).map((c) => (
          <li key={`${c.key}-${c.base_date}`} className="text-muted-foreground">
            {c.base_date} · {c.coverage_status} ·{" "}
            {relativeTime(c.published_at, locale)}
          </li>
        ))}
        {(checkpoints.data ?? []).length === 0 ? (
          <li className="text-muted-foreground">{t("risk.neverPublished")}</li>
        ) : null}
      </ul>

      <h2 className="mt-8 text-sm font-medium">{t("risk.runs")}</h2>
      <label
        className="mt-2 block text-xs text-muted-foreground"
        htmlFor="discard-reason"
      >
        {t("risk.discardReason")}
      </label>
      <input
        id="discard-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="mt-1 w-full max-w-md rounded-md border border-border bg-background px-2 py-1 text-sm"
      />

      <ul className="mt-3 space-y-2">
        {(runs.data ?? []).map((run) => (
          <li
            key={run.snapshot_id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
          >
            <span>
              {run.base_date}
              <span className="ml-2 text-xs text-muted-foreground">
                {run.status} · {relativeTime(run.created_at, locale)}
              </span>
            </span>
            {run.status === "staged" ? (
              <span className="flex gap-2">
                <button
                  type="button"
                  disabled={discard.isPending || reason.trim() === ""}
                  onClick={() => discard.mutate(run)}
                  className="rounded-md border border-border px-3 py-1 text-xs text-[var(--emergency)] disabled:opacity-50"
                >
                  {t("risk.discard")}
                </button>
                <button
                  type="button"
                  disabled={publish.isPending}
                  onClick={() => publish.mutate(run)}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  {t("risk.publish")}
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {error ? (
        <p className="mt-3 text-xs text-[var(--emergency)]">{error.message}</p>
      ) : null}
    </section>
  );
}
