import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "moderator" | "user";

export type Member = {
  id: string;
  display_name: string | null;
  locale: string;
  created_at: string;
  roles: AppRole[];
};

/** Admin-only: every profile plus its granted roles. RLS blocks non-admins. */
export const membersQuery = queryOptions({
  queryKey: ["roles", "members"],
  queryFn: async () => {
    const [{ data: profiles, error }, { data: roles }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, locale, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (error) throw new Error(error.message);
    const byUser = new Map<string, AppRole[]>();
    for (const row of roles ?? []) {
      const list = byUser.get(row.user_id) ?? [];
      list.push(row.role as AppRole);
      byUser.set(row.user_id, list);
    }
    return (profiles ?? []).map((p) => ({
      ...p,
      roles: byUser.get(p.id) ?? [],
    })) as Member[];
  },
});

export async function grantRole(userId: string, role: AppRole) {
  const { error } = await supabase
    .from("user_roles")
    .insert({ user_id: userId, role });
  if (error && !error.message.includes("duplicate"))
    throw new Error(error.message);
}

export async function revokeRole(userId: string, role: AppRole) {
  const { error } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("role", role);
  if (error) throw new Error(error.message);
}
