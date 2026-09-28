import { supabaseAdmin } from "@/integrations/supabase/client.server";

const json = (body: unknown, status: number) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function handleAlertCheck(request: Request): Promise<Response> {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return json({ error: "unauthorized" }, 401);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return json({ error: "unauthorized" }, 401);
  const { evaluateAlerts } = await import("@/lib/alerts-engine.server");
  return json(await evaluateAlerts(data.user.id), 200);
}
