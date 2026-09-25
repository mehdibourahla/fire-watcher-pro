import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const ATTENTION_ITEMS = [
  "broadcasting_off",
  "sources_unhealthy",
  "operational_incidents",
  "source_gaps",
  "delivery_backlog",
  "ita_review",
  "ita_failed",
  "fires",
  "citizen_reports",
  "translations",
  "ideas",
  "risk_pending",
] as const;

export type AttentionItem = (typeof ATTENTION_ITEMS)[number];
export type Attention = { count: number; oldest: string | null };
export type AttentionCounts = Partial<Record<AttentionItem, Attention>>;

const isAttentionItem = (item: string): item is AttentionItem =>
  (ATTENTION_ITEMS as readonly string[]).includes(item);

function toAttentionCounts(
  rows: { item: string; count: number; oldest: string | null }[],
): AttentionCounts {
  const counts: AttentionCounts = {};
  for (const row of rows)
    if (isAttentionItem(row.item))
      counts[row.item] = { count: Number(row.count), oldest: row.oldest };
  return counts;
}

export const attentionQuery = queryOptions({
  queryKey: ["admin", "attention"],
  queryFn: async (): Promise<AttentionCounts> => {
    const { data, error } = await supabase.rpc("admin_attention_counts");
    if (error) throw new Error(error.message);
    return toAttentionCounts(data ?? []);
  },
  staleTime: 15_000,
  refetchInterval: 30_000,
});

export function attentionTotal(
  counts: AttentionCounts | undefined,
  items: readonly AttentionItem[],
) {
  return items.reduce((sum, item) => sum + (counts?.[item]?.count ?? 0), 0);
}
