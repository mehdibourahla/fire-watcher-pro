import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { userTopic } from "@/lib/fcm";
import { fcmConfigured, fcmSubscribeTopics } from "@/lib/ingest/fcm.server";
import { readJsonBody } from "@/lib/request-body.server";

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function handleUserPush(request: Request): Promise<Response> {
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer (\S+)$/)?.[1];
  if (!bearer) return json({ error: "Authentication required" }, 401);
  const auth = await supabaseAdmin.auth.getUser(bearer);
  if (auth.error || !auth.data.user)
    return json({ error: "Invalid session" }, 401);
  const userId = auth.data.user.id;

  const quota = await supabaseAdmin.rpc("consume_rate_limit", {
    _bucket: `user-push:${userId}`,
    _limit: 10,
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
    Object.keys(body).length !== 2 ||
    !("token" in body) ||
    !("action" in body) ||
    typeof body.token !== "string" ||
    !body.token.trim() ||
    body.token.length > 4096 ||
    (body.action !== "subscribe" && body.action !== "unsubscribe")
  )
    return json({ error: "Invalid request" }, 400);

  const subscribe = body.action === "subscribe";
  const device_hash = await sha256Hex(body.token);
  // a registry row must never outlive the device's topic membership, or the drain reports "sent" to nobody
  if (!subscribe) {
    const removed = await supabaseAdmin
      .from("user_push_devices")
      .delete()
      .eq("user_id", userId)
      .eq("device_hash", device_hash);
    if (removed.error) return json({ error: "Device not recorded" }, 503);
  }

  try {
    await fcmSubscribeTopics(body.token, [userTopic(userId)], subscribe);
  } catch {
    return json({ error: "Push provider rejected the change" }, 502);
  }

  if (subscribe) {
    const recorded = await supabaseAdmin.from("user_push_devices").upsert({
      user_id: userId,
      device_hash,
      updated_at: new Date().toISOString(),
    });
    if (recorded.error) return json({ error: "Device not recorded" }, 503);
  }
  return json({ ok: true });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
