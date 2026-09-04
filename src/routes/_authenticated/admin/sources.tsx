import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import type { AnyLocale } from "@/i18n";
import {
  openGapsQuery,
  replayGap,
  sourceHealthQuery,
} from "@/lib/admin-sources";
import { relativeTime } from "@/lib/nadhir";

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
  const gaps = useQuery(openGapsQuery);

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

      <h2 className="mt-6 text-sm font-medium">{t("sources.health")}</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 pr-3">{t("sources.colSource")}</th>
              <th className="py-1 pr-3">{t("sources.colState")}</th>
              <th className="py-1 pr-3">{t("sources.colCriticality")}</th>
              <th className="py-1">{t("sources.colLastSuccess")}</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-sm font-medium">{t("sources.gaps")}</h2>
      {(gaps.data ?? []).length === 0 ? (
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
