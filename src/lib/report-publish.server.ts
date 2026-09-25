import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { publishWaitingReports } from "@/lib/report-publication.server";
import { readJsonBody } from "@/lib/request-body.server";

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function handleReportPublish(
  request: Request,
  publish = publishWaitingReports,
): Promise<Response> {
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer (\S+)$/)?.[1];
  if (!bearer) return json({ error: "Authentication required" }, 401);
  const auth = await supabaseAdmin.auth.getUser(bearer);
  if (auth.error || !auth.data.user)
    return json({ error: "Invalid session" }, 401);
  const userId = auth.data.user.id;

  const quota = await supabaseAdmin.rpc("consume_rate_limit", {
    _bucket: `report-publish:${userId}`,
    _limit: 10,
    _window_seconds: 600,
  });
  if (quota.error || quota.data == null)
    return json({ error: "Quota unavailable" }, 503);
  if (quota.data !== true) return json({ error: "Please wait" }, 429);

  const read = await readJsonBody(request, 1024);
  if ("error" in read) return json({ error: read.error }, read.status);
  const body = read.body;
  if (
    !body ||
    typeof body !== "object" ||
    Object.keys(body).length !== 1 ||
    !("id" in body) ||
    typeof body.id !== "string" ||
    !UUID.test(body.id)
  )
    return json({ error: "Invalid request" }, 400);

  const owned = await supabaseAdmin
    .from("citizen_reports")
    .select("id")
    .eq("id", body.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (owned.error) return json({ error: "Report unavailable" }, 503);
  if (!owned.data) return json({ error: "Report not found" }, 404);

  await publish([body.id]);

  const report = await supabaseAdmin
    .from("citizen_reports")
    .select("publish_state, hazard, summary")
    .eq("id", body.id)
    .single();
  if (report.error) return json({ error: "Report unavailable" }, 503);
  return json(report.data);
}
