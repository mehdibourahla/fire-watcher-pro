import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type WebhookEndpoint = {
  id: string;
  label: string;
  url: string;
  secret: string;
  kinds: string[];
  min_severity: number;
  active: boolean;
  last_status: number | null;
  last_attempt_at: string | null;
  last_error: string | null;
  created_at: string;
};

export type WebhookDelivery = {
  id: string;
  endpoint_id: string;
  alert_id: string | null;
  status_code: number | null;
  ok: boolean;
  error: string | null;
  created_at: string;
};

type WebhookMutationErrorKey =
  | "webhooks.kindsRequired"
  | "webhooks.saveFailed"
  | "webhooks.updateFailed"
  | "webhooks.deleteFailed";

export class WebhookMutationError extends Error {
  override cause?: unknown;

  constructor(message: WebhookMutationErrorKey, cause?: unknown) {
    super(message);
    this.name = "WebhookMutationError";
    this.cause = cause;
  }
}

export const webhookEndpointsQuery = queryOptions({
  queryKey: ["webhooks", "endpoints"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("webhook_endpoints")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as WebhookEndpoint[];
  },
});

export const webhookDeliveriesQuery = queryOptions({
  queryKey: ["webhooks", "deliveries"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("webhook_deliveries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as WebhookDelivery[];
  },
});

export async function createWebhook(input: {
  label: string;
  url: string;
  kinds: string[];
  min_severity: number;
}) {
  if (input.kinds.length === 0)
    throw new WebhookMutationError("webhooks.kindsRequired");

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user)
    throw new WebhookMutationError("webhooks.saveFailed", authError);
  const { error } = await supabase
    .from("webhook_endpoints")
    .insert({ ...input, user_id: auth.user.id });
  if (error) throw new WebhookMutationError("webhooks.saveFailed", error);
}

export async function updateWebhook(
  id: string,
  patch: Partial<Pick<WebhookEndpoint, "active" | "min_severity">>,
) {
  const { error } = await supabase
    .from("webhook_endpoints")
    .update(patch)
    .eq("id", id);
  if (error) throw new WebhookMutationError("webhooks.updateFailed", error);
}

export async function deleteWebhook(id: string) {
  const { error } = await supabase
    .from("webhook_endpoints")
    .delete()
    .eq("id", id);
  if (error) throw new WebhookMutationError("webhooks.deleteFailed", error);
}
