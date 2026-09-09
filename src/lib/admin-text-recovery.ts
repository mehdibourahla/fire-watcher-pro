import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const textRecoveryQuery = queryOptions({
  queryKey: ["admin", "sources", "text-recovery"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("document_extractions")
      .select(
        "document_id, attempts, updated_at, source_documents!inner(published_at, text_sources!inner(label))",
      )
      .gte("attempts", 4)
      .order("updated_at")
      .limit(50);
    if (error) throw new Error("text_recovery_load_failed");
    return data ?? [];
  },
  staleTime: 30_000,
  refetchInterval: 30_000,
});

export async function retryTextDocument(id: string): Promise<void> {
  const { error } = await supabase.rpc("retry_text_document", { _id: id });
  if (error) throw new Error("text_recovery_retry_failed");
}
