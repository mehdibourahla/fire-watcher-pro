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

export async function getBroadcastAudit() {
  const { data, error } = await supabase
    .from("broadcast_audit")
    .select(
      "id, at, action, reason, kind, phase, severity, commune_codes, actor_id",
    )
    .order("at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function setBroadcastEnabled(enabled: boolean) {
  const { data, error } = await supabase.rpc("set_broadcast_enabled", {
    _enabled: enabled,
  });
  if (error)
    throw new BroadcastAdminError("broadcastAdmin.toggleFailed", error);
  return data === true;
}

export async function submitAuthorityWarning(input: AuthorityWarningInput) {
  const source = input.source.trim();
  const body = input.body.trim();
  if (!source || !body)
    throw new BroadcastAdminError("broadcastAdmin.warningRequired");

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user)
    throw new BroadcastAdminError("broadcastAdmin.warningFailed", authError);

  const { error } = await supabase.from("authority_warnings").insert({
    source,
    received_via: input.received_via,
    body,
    severity: input.severity,
    wilaya_id: input.wilaya_id || null,
    created_by: auth.user.id,
  });
  if (error)
    throw new BroadcastAdminError("broadcastAdmin.warningFailed", error);
}
