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
