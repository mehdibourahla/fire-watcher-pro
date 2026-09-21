import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { civilInvestigationsQuery, itaReportsQuery } from "@/lib/admin-ita";
import { myRolesQuery } from "@/lib/reports";
import { supabase } from "@/integrations/supabase/client";
import { civilPublicationsQuery } from "@/lib/civil-publication-client";
import { CivilPublicationReview } from "./CivilPublicationReview";
import { CivilInvestigationQueue } from "./CivilInvestigationQueue";
import { CivilDecisionHistory } from "./CivilDecisionHistory";

export function ItaReports() {
  const { t } = useTranslation("admin");
  const [exhaustedOnly, setExhaustedOnly] = useState(false);
  const reports = useQuery(itaReportsQuery(exhaustedOnly));
  const investigations = useQuery(civilInvestigationsQuery);
  const publications = useQuery(civilPublicationsQuery(true));
  const [historyPage, setHistoryPage] = useState(0);
  const history = useQuery(civilPublicationsQuery(true, historyPage));
  const roles = useQuery(myRolesQuery);
  const isAdmin = !roles.isError && (roles.data ?? []).includes("admin");
  const qc = useQueryClient();
  const retry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("retry_ita_report", { _id: id });
      if (error) throw new Error(t("sources.ita.retryFailed"));
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin", "sources", "ita-reports"] }),
  });
  return (
    <section className="mt-8" aria-labelledby="ita-title">
      <h2 id="ita-title" className="text-sm font-medium">
        {t("sources.ita.title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("sources.ita.description")}
      </p>
      <CivilInvestigationQueue />
      {publications.isError && (
        <p role="alert" className="text-destructive">
          {publications.error.message}
        </p>
      )}
      {investigations.isError && (
        <p role="alert" className="text-destructive">
          {investigations.error.message}
        </p>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-medium">
          {t("publication.published")}
        </summary>
        {history.isError && (
          <p role="alert" className="text-destructive">
            {history.error.message}
          </p>
        )}
        {history.data?.map((publication) => (
          <div key={publication.id} className="mt-3 text-sm">
            <p lang="fr">{publication.summary}</p>
            <CivilPublicationReview
              reportId={publication.ita_report_id}
              incidentIndex={publication.incident_index}
              summary={publication.summary}
              publishedAt={publication.source_published_at}
              publication={publication}
            />
          </div>
        ))}
        <div className="mt-3 flex gap-3 text-sm">
          <button
            type="button"
            disabled={historyPage === 0 || history.isPending}
            onClick={() => setHistoryPage((page) => page - 1)}
          >
            {t("publication.previous")}
          </button>
          <span>{historyPage + 1}</span>
          <button
            type="button"
            disabled={history.data?.length !== 500 || history.isPending}
            onClick={() => setHistoryPage((page) => page + 1)}
          >
            {t("publication.next")}
          </button>
        </div>
      </details>
      <label className="mt-2 flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={exhaustedOnly}
          onChange={(e) => setExhaustedOnly(e.target.checked)}
        />
        {t("sources.ita.exhaustedOnly")}
      </label>
      {retry.isError && (
        <p role="alert" className="text-sm text-destructive">
          {retry.error.message}
        </p>
      )}
      {retry.isSuccess && (
        <p role="status" className="text-sm">
          {t("sources.ita.retryQueued")}
        </p>
      )}
      {reports.isPending && (
        <p className="mt-2 text-sm">{t("sources.loading")}</p>
      )}
      {reports.isError && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {t("sources.loadFailed")}: {reports.error.message}
        </p>
      )}
      {reports.data?.length === 0 && (
        <p className="mt-2 text-sm">{t("sources.ita.empty")}</p>
      )}
      <div className="mt-3 space-y-3">
        {reports.data?.map((report) => (
          <article
            key={report.id}
            className="rounded border border-border p-3 text-sm"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <a
                className="underline"
                href={report.source_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {report.source_page}
              </a>
              <time dateTime={report.published_at}>
                {new Date(report.published_at).toLocaleString()}
              </time>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("sources.ita.received", {
                time: new Date(report.fetched_at).toLocaleString(),
              })}
            </p>
            <p className="mt-2">
              {t(
                report.extraction
                  ? "sources.ita.extracted"
                  : report.extraction_error
                    ? "sources.ita.failed"
                    : "sources.ita.pending",
              )}
            </p>
            {report.extraction_error && (
              <p className="mt-1 text-xs text-destructive">
                {report.extraction_error} ({report.extraction_attempts}/5)
              </p>
            )}
            {isAdmin &&
              !report.extraction &&
              report.extraction_attempts >= 5 && (
                <button
                  type="button"
                  className="mt-2 rounded border px-3 py-1"
                  disabled={retry.isPending}
                  onClick={() => retry.mutate(report.id)}
                >
                  {t("sources.ita.retry")}
                </button>
              )}
            {report.extraction?.incidents.map((incident, index) => {
              const investigation = investigations.data?.find(
                (work) =>
                  work.report_id === report.id && work.incident_index === index,
              );
              return (
                <div key={index} className="mt-2 border-s-2 border-border ps-3">
                  <p lang="fr">{incident.summary_fr}</p>
                  <p className="mt-1 text-xs">
                    {t("publication.reportedStatus", {
                      status: incident.current_status,
                    })}
                  </p>
                  <blockquote dir="auto" className="mt-1 text-muted-foreground">
                    {incident.evidence}
                  </blockquote>
                  {incident.review_reasons.map((reason, i) => (
                    <p key={i} dir="auto" className="mt-1 text-xs">
                      {reason}
                    </p>
                  ))}
                  {investigation && (
                    <div className="mt-2 rounded bg-muted p-2">
                      <p className="font-medium">
                        {t(`publication.agent.${investigation.state}`)}
                      </p>
                      {investigation.latest && (
                        <p lang="fr" className="mt-1 text-xs">
                          {investigation.latest.decision.reason}
                        </p>
                      )}
                      {investigation.error && (
                        <p role="alert" className="text-xs text-destructive">
                          {investigation.error}
                        </p>
                      )}
                      {investigation.latest && (
                        <CivilDecisionHistory entries={investigation.history} />
                      )}
                    </div>
                  )}
                  {report.extraction?.disposition === "incident_report" &&
                    publications.isSuccess && (
                      <CivilPublicationReview
                        reportId={report.id}
                        incidentIndex={index}
                        summary={incident.summary_fr}
                        publishedAt={report.published_at}
                        suggestion={investigation?.latest?.decision}
                        publication={publications.data.find(
                          (item) =>
                            item.ita_report_id === report.id &&
                            item.incident_index === index,
                        )}
                      />
                    )}
                </div>
              );
            })}
            {report.extraction?.review_reasons.map((reason, index) => (
              <p key={index} dir="auto" className="mt-2 text-xs">
                {reason}
              </p>
            ))}
            <details className="mt-2">
              <summary className="cursor-pointer">
                {t("sources.ita.original")}
              </summary>
              <p dir="auto" className="mt-2 whitespace-pre-wrap">
                {report.body}
              </p>
            </details>
            {report.extraction && (
              <details className="mt-2">
                <summary className="cursor-pointer">
                  {t("sources.ita.analysis")}
                </summary>
                <pre
                  dir="ltr"
                  className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs"
                >
                  {JSON.stringify(report.extraction, null, 2)}
                </pre>
              </details>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
