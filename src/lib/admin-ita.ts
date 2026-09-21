import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ItaExtractionSchema } from "@/lib/text-sources/ita-extraction";
import { StoredCivilDecisionSchema } from "@/lib/civil-agent";

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
        const history = [...work.civil_decisions]
          .sort((a, b) => b.attempt - a.attempt)
          .map((entry) => ({
            ...entry,
            decision: StoredCivilDecisionSchema.parse(entry.decision),
          }));
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

export const civilInvestigationsQuery = queryOptions({
  queryKey: ["admin", "civil-investigations"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("civil_investigations")
      .select(
        "id,report_id,incident_index,state,error,updated_at,civil_decisions(decision,trace,model,created_at,attempt)",
      )
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data.map((work) => {
      const history = [...work.civil_decisions]
        .sort((a, b) => b.attempt - a.attempt)
        .map((entry) => ({
          ...entry,
          decision: StoredCivilDecisionSchema.parse(entry.decision),
        }));
      return {
        ...work,
        history,
        latest: history[0] ?? null,
      };
    });
  },
  staleTime: 30_000,
  refetchInterval: 30_000,
});

export const itaReportsQuery = (exhaustedOnly = false) =>
  queryOptions({
    queryKey: ["admin", "sources", "ita-reports", exhaustedOnly],
    queryFn: async () => {
      let query = supabase
        .from("ita_reports")
        .select(
          "id, source_page, source_url, published_at, fetched_at, body, extraction, extraction_error, extraction_attempts",
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
      }));
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
