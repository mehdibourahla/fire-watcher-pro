import { supabase } from "@/integrations/supabase/client";

type BroadcastAdminErrorKey =
  | "broadcastAdmin.toggleFailed"
  | "broadcastAdmin.warningFailed"
  | "broadcastAdmin.warningRequired";

export type AuthorityWarningInput = {
  source: string;
  received_via: string;
  body: string;
  severity: string;
  wilaya_id: string;
};

export class BroadcastAdminError extends Error {
  override cause?: unknown;

  constructor(message: BroadcastAdminErrorKey, cause?: unknown) {
    super(message);
    this.name = "BroadcastAdminError";
    this.cause = cause;
  }
}

export type BroadcastTransition = {
  changed: boolean;
  enabled: boolean;
  updated_at: string;
};

type BroadcastSettings = Pick<BroadcastTransition, "enabled" | "updated_at">;

type BroadcastQueryClient = {
  setQueryData: (queryKey: string[], data: BroadcastSettings) => unknown;
  invalidateQueries: (filters: { queryKey: string[] }) => Promise<unknown>;
};

export function hasConfirmedBroadcastSettings(
  settings: { enabled: boolean } | undefined,
  hasError: boolean,
): settings is { enabled: boolean } {
  return settings !== undefined && !hasError;
}

export async function applyBroadcastTransition(
  queryClient: BroadcastQueryClient,
  transition: BroadcastTransition,
) {
  queryClient.setQueryData(["broadcast_settings"], {
    enabled: transition.enabled,
    updated_at: transition.updated_at,
  });
  await Promise.allSettled([
    queryClient.invalidateQueries({ queryKey: ["broadcast_settings"] }),
    queryClient.invalidateQueries({ queryKey: ["broadcast_audit"] }),
  ]);
}

export async function getBroadcastAudit() {
  const { data, error } = await supabase
    .from("broadcast_audit")
    .select(
      "id, at, action, reason, kind, phase, severity, commune_codes, actor_id, payload",
    )
    .order("at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function setBroadcastEnabled(
  enabled: boolean,
  note: string | null = null,
) {
  const { data, error } = await supabase.rpc("set_broadcast_enabled", {
    _enabled: enabled,
    _note: note,
  });
  if (error)
    throw new BroadcastAdminError("broadcastAdmin.toggleFailed", error);
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    typeof data["changed"] !== "boolean" ||
    typeof data["enabled"] !== "boolean" ||
    typeof data["updated_at"] !== "string"
  )
    throw new BroadcastAdminError("broadcastAdmin.toggleFailed");
  return data as BroadcastTransition;
}

export async function submitAuthorityWarning(input: AuthorityWarningInput) {
  const source = input.source.trim();
  const body = input.body.trim();
  if (!source || !body)
    throw new BroadcastAdminError("broadcastAdmin.warningRequired");

  if (!input.wilaya_id)
    throw new BroadcastAdminError("broadcastAdmin.warningRequired");

  const { error } = await supabase.rpc("relay_authority_warning", {
    _source: source,
    _received_via: input.received_via,
    _body: body,
    _severity: input.severity,
    _wilaya: input.wilaya_id,
  });
  if (error)
    throw new BroadcastAdminError("broadcastAdmin.warningFailed", error);
}
