import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { civilAttentionQuery } from "@/lib/admin-ita";
import { CivilPublicationReview } from "./CivilPublicationReview";
import { CivilDecisionHistory } from "./CivilDecisionHistory";

export function CivilInvestigationQueue() {
  const { t } = useTranslation("admin");
  const [page, setPage] = useState(0);
  const queue = useQuery(civilAttentionQuery(page));
  return (
    <section className="mt-4 rounded border border-border p-3">
      <h3 className="text-sm font-medium">
        {t("publication.agent.attention")}
      </h3>
      {queue.isError && (
        <p role="alert" className="text-destructive">
          {queue.error.message}
        </p>
      )}
      {queue.isPending && <p>{t("sources.loading")}</p>}
      {queue.data?.map((work) => (
        <article
          key={work.id}
          className="mt-3 border-t border-border pt-3 text-sm"
        >
          <p className="font-medium">{t(`publication.agent.${work.state}`)}</p>
          <a
            href={work.report.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {work.report.source_page}
          </a>
          <p dir="auto" className="mt-1">
            {work.latest?.reason ?? work.error}
          </p>
          {work.history.length > 0 && (
            <CivilDecisionHistory entries={work.history} />
          )}
          {work.report.civil_publications.some(
            (p) => p.incident_index === work.incident_index,
          ) ? (
            <p>{t("publication.agent.superseded")}</p>
          ) : (
            <CivilPublicationReview
              reportId={work.report_id}
              incidentIndex={work.incident_index}
              summary={work.latest?.summary ?? work.summary}
              publishedAt={work.report.published_at}
              suggestion={work.latest ?? undefined}
            />
          )}
          <details className="mt-2">
            <summary>{t("sources.ita.original")}</summary>
            <p dir="auto" className="whitespace-pre-wrap">
              {work.report.body}
            </p>
          </details>
        </article>
      ))}
      {queue.data?.length === 0 && (
        <p className="mt-2 text-sm">{t("sources.ita.empty")}</p>
      )}
      <div className="mt-3 flex items-center gap-3 text-sm">
        <button
          type="button"
          disabled={page === 0 || queue.isPending}
          onClick={() => setPage(page - 1)}
        >
          {t("publication.previous")}
        </button>
        <span>{page + 1}</span>
        <button
          type="button"
          disabled={queue.isPending || queue.data?.length !== 50}
          onClick={() => setPage(page + 1)}
        >
          {t("publication.next")}
        </button>
      </div>
    </section>
  );
}
