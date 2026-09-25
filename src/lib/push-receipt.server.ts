import { supabaseAdmin } from "@/integrations/supabase/client.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const encoder = new TextEncoder();

function serviceSecret() {
  const value = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!value) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  return value;
}

// labelled so this signature can never be mistaken for another use of the same key
const signed = (alertId: string) => encoder.encode(`push-receipt:${alertId}`);

const hmacKey = (secret: string) =>
  crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

const toBase64Url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  // a length of 1 mod 4 is not base64 at all, and atob would throw on it
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(value) || value.length % 4 === 1)
    return null;
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function pushReceipt(alertId: string, secret = serviceSecret()) {
  return toBase64Url(
    await crypto.subtle.sign("HMAC", await hmacKey(secret), signed(alertId)),
  );
}

const store = {
  secret: serviceSecret,
  mark: async (alertId: string) => {
    const { error } = await supabaseAdmin
      .from("alerts")
      .update({ push_received_at: new Date().toISOString() })
      .eq("id", alertId)
      .is("push_received_at", null);
    if (error) throw new Error(error.message);
  },
};

export async function recordPushReceipt(
  body: unknown,
  dependencies: Partial<typeof store> = {},
): Promise<"recorded" | "forged" | "invalid"> {
  const deps = { ...store, ...dependencies };
  if (!body || typeof body !== "object" || Array.isArray(body))
    return "invalid";
  const fields = body as Record<string, unknown>;
  const { alert_id: alertId, receipt } = fields;
  if (
    Object.keys(fields).length !== 2 ||
    typeof alertId !== "string" ||
    !UUID.test(alertId) ||
    typeof receipt !== "string"
  )
    return "invalid";
  const signature = fromBase64Url(receipt);
  if (!signature) return "invalid";
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(deps.secret()),
    signature,
    signed(alertId),
  );
  if (!valid) return "forged";
  await deps.mark(alertId);
  return "recorded";
}
