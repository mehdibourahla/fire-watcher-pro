import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "admin"
  | "operator"
  | "report_moderator"
  | "translator"
  | "incident_editor"
  | "user";

export type Member = {
  id: string;
  email: string;
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
    ? ("people.lastAdminError" as const)
    : ("people.updateError" as const);
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

/** Admin-only: every account with its email, since a profile may carry no name at all. */
export const membersQuery = queryOptions({
  queryKey: ["roles", "members"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("list_members_for_admin");
    if (error) throw new Error(error.message);
    return (data ?? []) as Member[];
  },
});

export async function grantRole(userId: string, role: AppRole) {
  const { error } = await supabase.rpc("grant_user_role", {
    _user: userId,
    _role: role,
  });
  if (error) throw new Error(error.message);
}

export async function revokeRole(userId: string, role: AppRole) {
  const { error } = await supabase.rpc("revoke_user_role", {
    _user: userId,
    _role: role,
  });
  if (error) throw new Error(error.message);
}
