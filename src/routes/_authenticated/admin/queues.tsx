import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { IdeaQueue } from "@/components/admin/IdeaQueue";
import { ReportQueue } from "@/components/admin/ReportQueue";
import { TranslationQueue } from "@/components/admin/TranslationQueue";
import type { Locale } from "@/i18n";
import type { AppRole } from "@/lib/roles";
import { myRolesQuery } from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/admin/queues")({
  component: QueuesPage,
});

const TABS: { key: "reports" | "ideas" | "translations"; roles: AppRole[] }[] =
  [
    { key: "reports", roles: ["report_moderator", "admin"] },
    { key: "ideas", roles: ["report_moderator", "admin"] },
    { key: "translations", roles: ["translator", "admin"] },
  ];

const LABEL = {
  reports: "queues.tabReports",
  ideas: "queues.tabIdeas",
  translations: "queues.tabTranslations",
} as const;

function QueuesPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.language as Locale;
  const roles = useQuery(myRolesQuery);
  const [tab, setTab] = useState<string | null>(null);

  if (roles.isLoading) {
    return (
      <p className="text-sm text-muted-foreground">{t("queues.loading")}</p>
    );
  }

  const mine = roles.data ?? [];
  const open = TABS.filter((entry) =>
    entry.roles.some((role) => mine.includes(role)),
  );

  if (open.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t("queues.noAccess")}</p>
    );
  }

  const active = open.find((entry) => entry.key === tab) ?? open[0]!;

  return (
    <section>
      <h1 className="text-lg font-semibold">{t("queues.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("queues.subtitle")}
      </p>

      {open.length > 1 ? (
        <div className="mt-5 flex flex-wrap gap-2 border-b border-border pb-4">
          {open.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setTab(entry.key)}
              aria-pressed={entry.key === active.key}
              className={
                entry.key === active.key
                  ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                  : "rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground"
              }
            >
              {t(LABEL[entry.key])}
            </button>
          ))}
        </div>
      ) : null}

      {active.key === "reports" ? <ReportQueue locale={locale} /> : null}
      {active.key === "ideas" ? <IdeaQueue locale={locale} /> : null}
      {active.key === "translations" ? (
        <TranslationQueue locale={locale} />
      ) : null}
    </section>
  );
}
