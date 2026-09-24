import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ItaExtractionSchema } from "@/lib/text-sources/ita-extraction";
import { StoredCivilDecisionSchema } from "@/lib/civil-agent";
import type { Json } from "@/integrations/supabase/types";

const parseHistory = (
  decisions: {
    decision: unknown;
    attempt: number;
    created_at: string;
    trace: Json;
  }[],
) =>
  [...decisions]
    .sort((a, b) => b.attempt - a.attempt)
    .map((entry) => ({
      ...entry,
      decision: StoredCivilDecisionSchema.parse(entry.decision),
    }));

export const civilAttentionQuery = (page = 0) =>
  queryOptions({
    queryKey: ["admin", "civil-attention", page],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("civil_investigations")
        .select(
          "id,report_id,incident_index,state,error,updated_at,civil_decisions(decision,attempt,created_at,trace),report:ita_reports!inner(source_page,source_url,published_at,body,extraction,civil_publications(incident_index))",
        )
        .in("state", ["review", "failed"])
        .order("updated_at")
        .order("id")
        .range(page * 50, page * 50 + 49);
      if (error) throw new Error(error.message);
      return data.map((work) => {
        const history = parseHistory(work.civil_decisions);
        const extraction = ItaExtractionSchema.parse(work.report.extraction);
        return {
          ...work,
          history,
          latest: history[0]?.decision ?? null,
          summary: extraction.incidents[work.incident_index]?.summary_fr ?? "",
        };
      });
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

export const itaReportsQuery = (exhaustedOnly = false) =>
  queryOptions({
    queryKey: ["admin", "ita", "feed", exhaustedOnly],
    queryFn: async () => {
      let query = supabase
        .from("ita_reports")
        .select(
          "id, source_page, source_url, published_at, fetched_at, body, extraction, extraction_error, extraction_attempts, civil_publications(id, incident_index, state), civil_investigations(id, incident_index, state, error, civil_decisions(decision, attempt, created_at, trace))",
        )
        .order("fetched_at", { ascending: false })
        .limit(50);
      if (exhaustedOnly)
        query = query.is("extraction", null).gte("extraction_attempts", 5);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        ...row,
        extraction:
          row.extraction === null
            ? null
            : ItaExtractionSchema.parse(row.extraction),
        civil_investigations: row.civil_investigations.map((work) => ({
          ...work,
          history: parseHistory(work.civil_decisions),
        })),
      }));
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

export async function dismissCivilInvestigation(id: string, reason: string) {
  const { error } = await supabase.rpc("dismiss_civil_investigation", {
    _id: id,
    _reason: reason,
  });
  if (error) throw new Error(error.message);
}

export async function retryItaReport(id: string) {
  const { error } = await supabase.rpc("retry_ita_report", { _id: id });
  if (error) throw new Error(error.message);
}
