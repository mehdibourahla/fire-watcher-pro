import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import type { AnyLocale } from "@/i18n";
import { adminTriageQuery, rankTriage } from "@/lib/admin-triage";
import { relativeTime } from "@/lib/nadhir";
import { myRolesQuery } from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: TriagePage,
});

const TONE: Record<number, string> = {
  1: "border-destructive/40 bg-destructive/5",
  2: "border-border bg-muted/40",
  3: "border-border",
};

function TriagePage() {
  const { t, i18n } = useTranslation("admin");
  const roles = useQuery(myRolesQuery);
  const triage = useQuery({
    ...adminTriageQuery(roles.data ?? []),
    enabled: !roles.isLoading,
  });

  const rows = triage.data ? rankTriage(triage.data) : [];

  return (
    <section>
      <h1 className="text-lg font-semibold">{t("triage.title")}</h1>

      {triage.isError ? (
        <p className="mt-4 text-sm text-destructive">
          {(triage.error as Error).message}
        </p>
      ) : null}

      {triage.isSuccess && rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {t("triage.allClear")}{" "}
          {t("triage.checkedAt", {
            time: relativeTime(
              new Date().toISOString(),
              i18n.language as AnyLocale,
            ),
          })}
        </p>
      ) : null}

      <ul className="mt-4 space-y-2">
        {rows.map((row) => (
          <li
            key={row.key}
            className={`rounded-md border px-3 py-2 text-sm ${TONE[row.severity]}`}
          >
            {t(`triage.${row.key}`, { count: row.count ?? 0 })}
          </li>
        ))}
      </ul>
    </section>
  );
}
