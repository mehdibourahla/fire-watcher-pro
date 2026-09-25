import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fcmConfigured, fcmSend } from "@/lib/ingest/fcm.server";
import { testPushReceipt } from "@/lib/push-receipt.server";
import { readJsonBody } from "@/lib/request-body.server";

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function handlePushTest(request: Request): Promise<Response> {
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer (\S+)$/)?.[1];
  if (!bearer) return json({ error: "Authentication required" }, 401);
  try {
    const auth = await supabaseAdmin.auth.getUser(bearer);
    if (auth.error || !auth.data.user)
      return json({ error: "Invalid session" }, 401);
    const role = await supabaseAdmin.rpc("has_any_role", {
      _user_id: auth.data.user.id,
      _roles: ["admin"],
    });
    if (role.error || role.data == null)
      return json({ error: "Authorization unavailable" }, 503);
    if (role.data !== true)
      return json({ error: "Admin access required" }, 403);
    const quota = await supabaseAdmin.rpc("consume_rate_limit", {
      _bucket: `push-test:${auth.data.user.id}`,
      _limit: 2,
      _window_seconds: 60,
    });
    if (quota.error || quota.data == null)
      return json({ error: "Quota unavailable" }, 503);
    if (quota.data !== true)
      return json({ error: "Please wait one minute" }, 429);
    if (!fcmConfigured()) return json({ error: "Push is not configured" }, 503);
    const read = await readJsonBody(request, 8192);
    if ("error" in read) return json({ error: read.error }, read.status);
    const body = read.body;
    if (
      !body ||
      typeof body !== "object" ||
      Object.keys(body).length !== 1 ||
      !("token" in body) ||
      typeof body.token !== "string" ||
      !body.token.trim() ||
      body.token.length > 4096
    )
      return json({ error: "Invalid device token" }, 400);
    const row = await supabaseAdmin
      .from("push_test_receipts")
      .insert({ user_id: auth.data.user.id })
      .select("id")
      .single();
    if (row.error) return json({ error: "Push test unavailable" }, 503);
    const testId = row.data.id;
    const receipt = await testPushReceipt(testId);
    try {
      // Give the tester time to background the iPhone web app.
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await fcmSend({
        token: body.token,
        notification: {
          title: "Nadhir — TEST",
          body: "Private push delivery test. This is not a fire alert.",
        },
        webpush: {
          headers: { TTL: "60" },
          fcm_options: { link: "https://nadhir.app/admin/sources" },
        },
        data: {
          kind: "test",
          test_id: testId,
          receipt,
        },
      });
    } catch {
      return json({ error: "Push provider rejected the test" }, 502);
    }
    return json({ accepted: true, testId });
  } catch {
    return json({ error: "Push test unavailable" }, 503);
  }
}
