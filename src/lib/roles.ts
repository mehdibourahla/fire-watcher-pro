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
  last_sign_in_at: string | null;
  roles: AppRole[];
  zone_count: number;
  report_count: number;
};

export type MemberDetail = {
  alert_email: boolean | null;
  alert_push: boolean | null;
  min_danger_level: number | null;
  min_confidence: number | null;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
  has_phone: boolean;
  zones: { id: string; name: string | null }[];
  alerts_received: number;
  webhooks: number;
  recent_actions: { at: string; action: string; domain: string }[];
};

export const GRANTABLE_ROLES: AppRole[] = [
  "operator",
  "report_moderator",
  "translator",
  "incident_editor",
  "admin",
];

export function memberDetailQuery(userId: string) {
  return queryOptions({
    queryKey: ["roles", "member-detail", userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("member_detail_for_admin", {
        _user: userId,
      });
      if (error) throw new Error(error.message);
      return data as unknown as MemberDetail;
    },
    staleTime: 30_000,
  });
}

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
