import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { AnyLocale } from "@/i18n";
import { adminAuditQuery, AUDIT_DOMAINS } from "@/lib/admin-audit";
import { relativeTime } from "@/lib/nadhir";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  component: AuditPage,
});

function AuditPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.language as AnyLocale;
  const [domain, setDomain] = useState<string | null>(null);
  const entries = useQuery(adminAuditQuery(domain));

  return (
    <section>
      <h1 className="text-lg font-semibold">{t("audit.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("audit.subtitle")}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setDomain(null)}
          aria-pressed={domain === null}
          className={
            domain === null
              ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
              : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
          }
        >
          {t("audit.filterAll")}
        </button>
        {AUDIT_DOMAINS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDomain(d)}
            aria-pressed={domain === d}
            className={
              domain === d
                ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
            }
          >
            {t(`nav.${d}`)}
          </button>
        ))}
      </div>

      {entries.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {t("queues.loading")}
        </p>
      ) : (entries.data ?? []).length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{t("audit.empty")}</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {(entries.data ?? []).map((entry) => (
            <li
              key={entry.id}
              className="rounded-md border border-border px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{entry.action}</span>
                <span className="text-xs text-muted-foreground">
                  {relativeTime(entry.at, locale)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {entry.actor_kind === "system"
                  ? t("audit.bySystem", { job: entry.actor_label ?? "" })
                  : t("audit.byPerson")}
                {entry.reason ? ` — ${entry.reason}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
