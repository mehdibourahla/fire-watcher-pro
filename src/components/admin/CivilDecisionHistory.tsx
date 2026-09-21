import { useTranslation } from "react-i18next";
import type { Json } from "@/integrations/supabase/types";
import type { CivilDecision } from "@/lib/civil-agent";

export function CivilDecisionHistory({
  entries,
}: {
  entries: {
    attempt: number;
    created_at: string;
    decision: CivilDecision;
    trace: Json;
  }[];
}) {
  const { t } = useTranslation("admin");
  return (
    <details className="mt-1 text-xs">
      <summary>{t("publication.agent.evidence")}</summary>
      {entries.map((entry) => (
        <div key={entry.attempt} className="mt-2 border-t border-border pt-2">
          <p>
            {t(`publication.agent.${entry.decision.outcome}`)} ·{" "}
            <time dateTime={entry.created_at}>
              {new Date(entry.created_at).toLocaleString()}
            </time>
          </p>
          <p dir="auto">{entry.decision.reason}</p>
          {entry.decision.official_match && (
            <div className="my-2 border-s-2 border-border ps-2" dir="auto">
              <p className="font-medium">
                {t(
                  `publication.agent.official.${entry.decision.official_match.relationship}`,
                )}
              </p>
              <p>{entry.decision.official_match.reason}</p>
              <p>
                ITA: <q>{entry.decision.official_match.source_quote}</q>
              </p>
              <p>
                Protection Civile:{" "}
                <q>{entry.decision.official_match.official_quote}</q>
              </p>
            </div>
          )}
          <pre
            dir="ltr"
            className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words"
          >
            {JSON.stringify(entry.trace, null, 2)}
          </pre>
        </div>
      ))}
    </details>
  );
}
