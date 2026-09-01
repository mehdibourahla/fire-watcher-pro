import dns from "node:dns";
import { isIP } from "node:net";

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

export type WebhookAddressResolver = {
  resolve4(hostname: string): Promise<readonly string[]>;
  resolve6(hostname: string): Promise<readonly string[]>;
};

const defaultResolver: WebhookAddressResolver = {
  resolve4: (hostname) => dns.promises.resolve4(hostname),
  resolve6: (hostname) => dns.promises.resolve6(hostname),
};

const NON_PUBLIC_IPV4_RANGES = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const;

const NON_PUBLIC_IPV6_RANGES = [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:20::", 28],
  ["2001:30::", 28],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const;

function parseIpv4(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const byte = Number(part);
    if (byte > 255) return null;
    value = value * 256 + byte;
  }
  return value;
}

function parseIpv6(address: string): bigint | null {
  let normalized = address.toLowerCase();
  if (normalized.includes("%")) return null;
  if (normalized.includes(".")) {
    const separator = normalized.lastIndexOf(":");
    const ipv4 = parseIpv4(normalized.slice(separator + 1));
    if (separator < 0 || ipv4 === null) return null;
    normalized = `${normalized.slice(0, separator)}:${(ipv4 >>> 16).toString(
      16,
    )}:${(ipv4 & 0xffff).toString(16)}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const parts = [...left, ...Array(missing).fill("0"), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part)))
    return null;

  return parts.reduce(
    (value, part) => (value << 16n) | BigInt(`0x${part}`),
    0n,
  );
}

function matchesIpv4Range(address: number, network: string, prefix: number) {
  const networkAddress = parseIpv4(network);
  if (networkAddress === null) return false;
  const shift = 32 - prefix;
  return (
    Math.floor(address / 2 ** shift) === Math.floor(networkAddress / 2 ** shift)
  );
}

function matchesIpv6Range(address: bigint, network: string, prefix: number) {
  const networkAddress = parseIpv6(network);
  if (networkAddress === null) return false;
  const shift = BigInt(128 - prefix);
  return address >> shift === networkAddress >> shift;
}

function isGloballyPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const parsed = parseIpv4(address);
    return (
      parsed !== null &&
      !NON_PUBLIC_IPV4_RANGES.some(([network, prefix]) =>
        matchesIpv4Range(parsed, network, prefix),
      )
    );
  }
  if (version === 6) {
    const parsed = parseIpv6(address);
    return (
      parsed !== null &&
      !NON_PUBLIC_IPV6_RANGES.some(([network, prefix]) =>
        matchesIpv6Range(parsed, network, prefix),
      )
    );
  }
  return false;
}

function isNoAddressError(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error))
    return false;
  return error.code === "ENODATA";
}

async function resolveAddresses(
  hostname: string,
  resolver: WebhookAddressResolver,
) {
  const results = await Promise.allSettled([
    resolver.resolve4(hostname),
    resolver.resolve6(hostname),
  ]);
  const addresses: string[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") addresses.push(...result.value);
    else if (!isNoAddressError(result.reason)) throw result.reason;
  }
  return addresses;
}

export async function isDeliverableUrl(
  raw: string,
  resolver: WebhookAddressResolver = defaultResolver,
): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  )
    return false;

  if (isIP(host)) return isGloballyPublicAddress(host);
  try {
    const addresses = await resolveAddresses(host, resolver);
    return addresses.length > 0 && addresses.every(isGloballyPublicAddress);
  } catch {
    return false;
  }
}

type WebhookRequestDependencies = {
  resolver?: WebhookAddressResolver;
  fetcher?: typeof fetch;
};

export async function sendWebhookRequest(
  url: string,
  secret: string,
  body: string,
  dependencies: WebhookRequestDependencies = {},
) {
  if (!(await isDeliverableUrl(url, dependencies.resolver)))
    throw new Error("endpoint url must be https and publicly routable");
  const signature = await sign(secret, body);
  return (dependencies.fetcher ?? fetch)(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Nadhir-Signature": `sha256=${signature}`,
    },
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
  });
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
        const response = await sendWebhookRequest(
          endpoint.url,
          endpoint.secret,
          body,
        );
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
