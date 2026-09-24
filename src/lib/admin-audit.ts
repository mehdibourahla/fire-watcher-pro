import { infiniteQueryOptions } from "@tanstack/react-query";

import type { Json } from "@/integrations/supabase/types";
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
  before: Json | null;
  after: Json | null;
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

export const AUDIT_ACTORS = ["user", "system", "all"] as const;
export type AuditActor = (typeof AUDIT_ACTORS)[number];

export const AUDIT_PAGE = 50;

const QUEUE_PAGES: Record<string, string> = {
  ita: "/admin/ita",
  report: "/admin/reports",
  translation: "/admin/translations",
  idea: "/admin/ideas",
};

export function auditTargetPath(entry: Pick<AuditEntry, "domain" | "action">) {
  if (entry.domain === "queues")
    return QUEUE_PAGES[entry.action.split(".")[0] ?? ""] ?? null;
  return (AUDIT_DOMAINS as readonly string[]).includes(entry.domain)
    ? `/admin/${entry.domain}`
    : null;
}

export const actionKey = (action: string) => action.replaceAll(".", "_");

const record = (value: Json | null) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};

export function auditChanges(entry: Pick<AuditEntry, "before" | "after">) {
  const before = record(entry.before);
  const after = record(entry.after);
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => ({
      key,
      before: before[key] ?? null,
      after: after[key] ?? null,
    }));
}

export function auditQuery(domain: string | null, actor: AuditActor) {
  return infiniteQueryOptions({
    queryKey: ["admin", "audit", domain ?? "all", actor],
    initialPageParam: null as { at: string; id: string } | null,
    queryFn: async ({ pageParam }): Promise<AuditEntry[]> => {
      let q = supabase
        .from("admin_audit_timeline")
        .select("*")
        .order("at", { ascending: false })
        .order("id", { ascending: false })
        .limit(AUDIT_PAGE);
      if (domain) q = q.eq("domain", domain);
      if (actor !== "all") q = q.eq("actor_kind", actor);
      if (pageParam)
        q = q.or(
          `at.lt."${pageParam.at}",and(at.eq."${pageParam.at}",id.lt.${pageParam.id})`,
        );
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as AuditEntry[];
    },
    getNextPageParam: (last) => {
      const tail = last.at(-1);
      return last.length < AUDIT_PAGE || !tail
        ? null
        : { at: tail.at, id: tail.id };
    },
    staleTime: 30_000,
  });
}
