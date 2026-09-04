import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type AuditEntry = {
  id: string;
  at: string;
  actor_user_id: string | null;
  actor_kind: string;
  actor_label: string | null;
  domain: string;
  action: string;
  target_table: string;
  target_id: string | null;
  reason: string | null;
};

export const AUDIT_DOMAINS = [
  "sources",
  "fires",
  "risk",
  "incidents",
  "broadcasts",
  "queues",
  "places",
  "people",
] as const;

export function adminAuditQuery(domain: string | null) {
  return queryOptions({
    queryKey: ["admin", "audit", domain ?? "all"],
    queryFn: async (): Promise<AuditEntry[]> => {
      let q = supabase
        .from("admin_audit_timeline")
        .select("*")
        .order("at", { ascending: false })
        .limit(200);
      if (domain) q = q.eq("domain", domain);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as AuditEntry[];
    },
    staleTime: 30_000,
  });
}
