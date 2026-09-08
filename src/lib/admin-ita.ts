import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ItaExtractionSchema } from "@/lib/text-sources/ita-extraction";

export const itaReportsQuery = queryOptions({
  queryKey: ["admin", "sources", "ita-reports"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("ita_reports")
      .select(
        "id, source_page, source_url, published_at, fetched_at, body, extraction, extraction_error, extraction_attempts",
      )
      .order("fetched_at", { ascending: false })
      .limit(50);
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
