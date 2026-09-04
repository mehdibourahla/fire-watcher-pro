import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { AnyLocale } from "@/i18n";
import {
  resolveFire,
  RESOLUTION_REASONS,
  unresolvedFiresQuery,
  type ResolutionReason,
  type UnresolvedFire,
} from "@/lib/admin-fires";
import { relativeTime } from "@/lib/nadhir";

export const Route = createFileRoute("/_authenticated/admin/fires")({
  component: FiresPage,
});

function FiresPage() {
  const { t } = useTranslation("admin");
  const fires = useQuery(unresolvedFiresQuery);

  return (
    <section>
      <h1 className="text-lg font-semibold">{t("fires.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("fires.subtitle")}
      </p>

      {fires.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {t("queues.loading")}
        </p>
      ) : (fires.data ?? []).length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("fires.empty")}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {(fires.data ?? []).map((fire) => (
            <FireCard key={fire.id} fire={fire} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FireCard({ fire }: { fire: UnresolvedFire }) {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.language as AnyLocale;
  const qc = useQueryClient();
  const [reason, setReason] = useState<ResolutionReason>("flare");
  const [note, setNote] = useState("");

  const act = useMutation({
    mutationFn: (state: "extinguished" | "false_positive") =>
      resolveFire({
        id: fire.id,
        state,
        reason: state === "false_positive" ? reason : null,
        note: note.trim() === "" ? null : note.trim(),
        expectedUpdatedAt: fire.updated_at,
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin", "fires", "unresolved"] }),
  });

  return (
    <li className="card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{fire.short_id}</span>
        <span className="text-xs text-muted-foreground">
          {relativeTime(fire.last_detected_at, locale)}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("fires.detail", {
          lat: fire.lat.toFixed(3),
          lon: fire.lon.toFixed(3),
          confidence: ((fire.confidence ?? 0) * 100).toFixed(0),
          detections: fire.detection_count ?? 0,
        })}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t("fires.reason")}
          value={reason}
          onChange={(e) => setReason(e.target.value as ResolutionReason)}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
        >
          {RESOLUTION_REASONS.map((r) => (
            <option key={r} value={r}>
              {t(`fires.reason_${r}`)}
            </option>
          ))}
        </select>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("fires.note")}
          className="min-w-40 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
        />
        <button
          type="button"
          disabled={act.isPending}
          onClick={() => act.mutate("false_positive")}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-[var(--emergency)] disabled:opacity-50"
        >
          {t("fires.markFalse")}
        </button>
        <button
          type="button"
          disabled={act.isPending}
          onClick={() => act.mutate("extinguished")}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {t("fires.markEnded")}
        </button>
      </div>

      {act.isError ? (
        <p className="text-xs text-[var(--emergency)]">
          {(act.error as Error).message.includes("stale_write")
            ? t("fires.staleWrite")
            : (act.error as Error).message}
        </p>
      ) : null}
    </li>
  );
}
