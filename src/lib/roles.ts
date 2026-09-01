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

export function adminRevocationGuard(input: {
  currentUserId: string;
  targetUserId: string;
  adminCount: number;
}) {
  const selfRevocation = input.currentUserId === input.targetUserId;
  const disabled = selfRevocation && input.adminCount <= 1;
  return {
    disabled,
    needsConfirmation: selfRevocation && !disabled,
  };
}

export function roleMutationErrorKey(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("last_admin_required")
    ? ("team.lastAdminError" as const)
    : ("team.updateError" as const);
}

/* The session no longer rides in the route context, so the self-revocation guard
 * has to read the signed-in id itself; an absent id would silently make every row
 * look like someone else's. */
export const currentUserIdQuery = queryOptions({
  queryKey: ["auth", "current-user-id"],
  queryFn: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw new Error(error.message);
    return data.user?.id ?? null;
  },
});

export const adminCountQuery = queryOptions({
  queryKey: ["roles", "admin-count"],
  queryFn: async () => {
    const { count, error } = await supabase
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if (error) throw new Error(error.message);
    return count ?? 0;
  },
});

/** Admin-only: every profile plus its granted roles. RLS blocks non-admins. */
export const membersQuery = queryOptions({
  queryKey: ["roles", "members"],
  queryFn: async () => {
    const [{ data: profiles, error }, { data: roles, error: rolesError }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id, display_name, locale, created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("user_roles").select("user_id, role"),
      ]);
    if (error) throw new Error(error.message);
    if (rolesError) throw new Error(rolesError.message);
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
