import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import type { AnyLocale } from "@/i18n";
import {
  editIncident,
  INCIDENT_STATUSES,
  officialIncidentsQuery,
  type IncidentStatus,
} from "@/lib/admin-incidents";
import { relativeTime } from "@/lib/nadhir";

export const Route = createFileRoute("/_authenticated/admin/incidents")({
  component: IncidentsPage,
});

function IncidentsPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.language as AnyLocale;
  const qc = useQueryClient();
  const incidents = useQuery(officialIncidentsQuery);

  const edit = useMutation({
    mutationFn: ({ id, status }: { id: string; status: IncidentStatus }) =>
      editIncident(id, { status }, null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "incidents"] }),
  });

  return (
    <section>
      <h1 className="text-lg font-semibold">{t("incidents.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("incidents.subtitle")}
      </p>

      {incidents.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {t("queues.loading")}
        </p>
      ) : (incidents.data ?? []).length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {t("incidents.empty")}
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {(incidents.data ?? []).map((incident) => (
            <li
              key={incident.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span>
                {t(`incidents.kind_${incident.kind}`)}
                <span className="ml-2 text-xs text-muted-foreground">
                  {incident.authority_tier} ·{" "}
                  {relativeTime(incident.last_reported_at, locale)}
                  {incident.unlisted_at ? ` · ${t("incidents.unlisted")}` : ""}
                </span>
              </span>
              <select
                aria-label={t("incidents.status")}
                value={incident.status}
                disabled={edit.isPending}
                onChange={(e) =>
                  edit.mutate({
                    id: incident.id,
                    status: e.target.value as IncidentStatus,
                  })
                }
                className="rounded-md border border-border bg-background px-2 py-1 text-xs"
              >
                {INCIDENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`incidents.status_${s}`)}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}

      {edit.isError ? (
        <p className="mt-3 text-xs text-[var(--emergency)]">
          {(edit.error as Error).message}
        </p>
      ) : null}
    </section>
  );
}
