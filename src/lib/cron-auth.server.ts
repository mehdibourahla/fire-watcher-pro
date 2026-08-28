import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Accepts either the platform cron secret (LOVABLE_CRON_SECRET) or the
 * internal token used by the database scheduler (pg_cron -> pg_net), which is
 * stored in the service-role-only table public.internal_cron_token.
 */
export async function authenticateSchedulerRequest(
  request: Request,
): Promise<Response | null> {
  const platform = await authenticateCronRequest(request.clone());
  if (!platform) return null;

  const match = /^Bearer ([^\s,]+)$/.exec(
    request.headers.get("authorization") ?? "",
  );
  const token = match?.[1];
  if (!token) return platform;

  try {
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("internal_cron_token")
      .select("token")
      .maybeSingle();
    const expected = (data as { token?: string } | null)?.token;
    if (expected && expected.length === token.length) {
      const { timingSafeEqual } = await import("node:crypto");
      if (timingSafeEqual(Buffer.from(expected), Buffer.from(token)))
        return null;
    }
  } catch {
    // fall through to the platform response
  }
  return platform;
}
