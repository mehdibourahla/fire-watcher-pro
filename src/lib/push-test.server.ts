import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fcmConfigured, fcmSend } from "@/lib/ingest/fcm.server";

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
    let body: unknown;
    try {
      const reader = request.body?.getReader();
      if (!reader) return json({ error: "Missing body" }, 400);
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 8192) {
          await reader.cancel();
          return json({ error: "Body too large" }, 413);
        }
        chunks.push(chunk.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
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
        data: { kind: "test" },
      });
    } catch {
      return json({ error: "Push provider rejected the test" }, 502);
    }
    return json({ accepted: true });
  } catch {
    return json({ error: "Push test unavailable" }, 503);
  }
}
