import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Locale } from "@/i18n";
import { relativeTime } from "@/lib/nadhir";
import {
  moderateSuggestion,
  suggestionQueueQuery,
  type SuggestionStatus,
} from "@/lib/translate";

export function TranslationQueue({ locale }: { locale: Locale }) {
  const { t } = useTranslation("admin");
  const qc = useQueryClient();
  const queue = useQuery(suggestionQueueQuery);
  const [filter, setFilter] = useState<SuggestionStatus>("pending");

  const act = useMutation({
    mutationFn: ({ id, status }: { id: string; status: SuggestionStatus }) =>
      moderateSuggestion(id, status),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["translation-suggestions"] }),
  });

  const rows = (queue.data ?? []).filter((s) => s.status === filter);
  const countOf = (s: SuggestionStatus) =>
    (queue.data ?? []).filter((r) => r.status === s).length;

  const filters: { key: SuggestionStatus; label: string }[] = [
    { key: "pending", label: t("queues.filterPending") },
    { key: "accepted", label: t("queues.filterAccepted") },
    { key: "rejected", label: t("queues.filterRejected") },
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
          {t("queues.loading")}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          {t("queues.translationsEmpty")}
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((s) => (
            <li key={s.id} className="card flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-md bg-[var(--accent-tint)] px-2 py-0.5 font-semibold uppercase tracking-wider text-[var(--accent)]">
                  {s.locale}
                </span>
                <span className="font-mono text-[10.5px]">{s.key_path}</span>
                <span aria-hidden>·</span>
                <span>{relativeTime(s.created_at, locale)}</span>
                {s.reviewer_name ? (
                  <>
                    <span aria-hidden>·</span>
                    <span>{s.reviewer_name}</span>
                  </>
                ) : null}
              </div>

              <div className="grid gap-2 text-sm md:grid-cols-2">
                <span dir="ltr" className="text-muted-foreground">
                  {s.source_text}
                </span>
                {s.verdict === "confirmed" ? (
                  <span className="text-[var(--accent)]">
                    {t("queues.confirmedAsIs")}
                  </span>
                ) : (
                  <span className="flex flex-col gap-1">
                    <span className="text-faint line-through">
                      {s.current_text}
                    </span>
                    <span className="font-medium">{s.suggestion}</span>
                  </span>
                )}
              </div>

              {s.status === "pending" ? (
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  <button
                    type="button"
                    disabled={act.isPending}
                    onClick={() => act.mutate({ id: s.id, status: "accepted" })}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {t("queues.accept")}
                  </button>
                  <button
                    type="button"
                    disabled={act.isPending}
                    onClick={() => act.mutate({ id: s.id, status: "rejected" })}
                    className="rounded-md border border-border px-3 py-1.5 text-xs text-[var(--emergency)] disabled:opacity-50"
                  >
                    {t("queues.reject")}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        {t("queues.applyNote")}
      </p>
    </section>
  );
}
