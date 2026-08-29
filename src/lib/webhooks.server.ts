import { supabaseAdmin } from "@/integrations/supabase/client.server";

type AlertRow = {
  id: string;
  user_id: string;
  kind: string;
  severity: number;
  title: string;
  body: string;
  distance_km: number | null;
  zone_id: string | null;
  payload: unknown;
  created_at?: string;
};

async function sign(secret: string, body: string) {
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

// The URL is user-supplied and the response body is stored where its owner can read
// it, so an unchecked target turns delivery into a read primitive against any host.
export function isDeliverableUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  )
    return false;
  if (host.startsWith("[")) return false;

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
  }
  return true;
}

/** Fan alerts out to each owner's active webhook endpoints. Never throws. */
export async function dispatchWebhooks(alerts: AlertRow[]) {
  if (!alerts.length) return { sent: 0, failed: 0 };
  const userIds = [...new Set(alerts.map((a) => a.user_id))];
  const { data: endpoints } = await supabaseAdmin
    .from("webhook_endpoints")
    .select("*")
    .eq("active", true)
    .in("user_id", userIds);
  if (!endpoints?.length) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const deliveries: Record<string, unknown>[] = [];
  const deliveredAlertIds = new Set<string>();

  for (const endpoint of endpoints) {
    const matching = alerts.filter(
      (a) =>
        a.user_id === endpoint.user_id &&
        (endpoint.kinds as string[]).includes(a.kind) &&
        a.severity >= endpoint.min_severity,
    );
    for (const alert of matching) {
      const body = JSON.stringify({
        type: `alert.${alert.kind}`,
        alert: {
          id: alert.id,
          kind: alert.kind,
          severity: alert.severity,
          title: alert.title,
          body: alert.body,
          distance_km: alert.distance_km,
          zone_id: alert.zone_id,
          payload: alert.payload,
        },
        sent_at: new Date().toISOString(),
      });
      let status: number | null = null;
      let error: string | null = null;
      try {
        if (!isDeliverableUrl(endpoint.url))
          throw new Error("endpoint url must be https and publicly routable");
        const signature = await sign(endpoint.secret, body);
        const response = await fetch(endpoint.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Nadhir-Signature": `sha256=${signature}`,
          },
          body,
          signal: AbortSignal.timeout(8000),
        });
        status = response.status;
        if (!response.ok) error = (await response.text()).slice(0, 300);
      } catch (e) {
        error = e instanceof Error ? e.message : "delivery failed";
      }
      const ok = status !== null && status >= 200 && status < 300;
      if (ok) {
        sent += 1;
        deliveredAlertIds.add(alert.id);
      } else {
        failed += 1;
      }
      deliveries.push({
        endpoint_id: endpoint.id,
        user_id: endpoint.user_id,
        alert_id: alert.id,
        status_code: status,
        ok,
        error,
      });
      await supabaseAdmin
        .from("webhook_endpoints")
        .update({
          last_status: status,
          last_error: error,
          last_attempt_at: new Date().toISOString(),
        })
        .eq("id", endpoint.id);
    }
  }

  if (deliveries.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabaseAdmin.from("webhook_deliveries").insert(deliveries as any);
  }
  if (deliveredAlertIds.size) {
    await supabaseAdmin
      .from("alerts")
      .update({ delivered_webhook: true })
      .in("id", [...deliveredAlertIds]);
  }
  return { sent, failed };
}
