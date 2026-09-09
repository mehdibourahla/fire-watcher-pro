import dns from "node:dns";
import { isIP } from "node:net";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

type ReachabilityRule = readonly [
  network: string,
  prefix: number,
  globallyReachable: boolean,
];

const IPV4_REACHABILITY_RULES: readonly ReachabilityRule[] = [
  ["0.0.0.0", 8, false],
  ["10.0.0.0", 8, false],
  ["100.64.0.0", 10, false],
  ["127.0.0.0", 8, false],
  ["169.254.0.0", 16, false],
  ["172.16.0.0", 12, false],
  ["192.0.0.0", 24, false],
  ["192.0.0.9", 32, true],
  ["192.0.0.10", 32, true],
  ["192.0.2.0", 24, false],
  ["192.31.196.0", 24, true],
  ["192.52.193.0", 24, true],
  ["192.88.99.0", 24, false],
  ["192.168.0.0", 16, false],
  ["192.175.48.0", 24, true],
  ["198.18.0.0", 15, false],
  ["198.51.100.0", 24, false],
  ["203.0.113.0", 24, false],
  ["224.0.0.0", 4, false],
  ["240.0.0.0", 4, false],
] as const;

const IPV6_REACHABILITY_RULES: readonly ReachabilityRule[] = [
  ["2000::", 3, true],
  ["::", 128, false],
  ["::1", 128, false],
  ["::ffff:0:0", 96, false],
  ["64:ff9b::", 96, true],
  ["64:ff9b:1::", 48, false],
  ["100::", 64, false],
  ["100:0:0:1::", 64, false],
  ["2001::", 23, false],
  ["2001::", 32, false],
  ["2001:1::1", 128, true],
  ["2001:1::2", 128, true],
  ["2001:1::3", 128, true],
  ["2001:2::", 48, false],
  ["2001:3::", 32, true],
  ["2001:4:112::", 48, true],
  ["2001:10::", 28, false],
  ["2001:20::", 28, true],
  ["2001:30::", 28, true],
  ["2001:db8::", 32, false],
  ["2002::", 16, false],
  ["2620:4f:8000::", 48, true],
  ["3fff::", 20, false],
  ["5f00::", 16, false],
  ["fc00::", 7, false],
  ["fe80::", 10, false],
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

function classifyByLongestPrefix(
  rules: readonly ReachabilityRule[],
  matches: (network: string, prefix: number) => boolean,
  defaultReachability: boolean,
) {
  let longestPrefix = -1;
  let globallyReachable = defaultReachability;
  for (const [network, prefix, ruleReachability] of rules) {
    if (prefix > longestPrefix && matches(network, prefix)) {
      longestPrefix = prefix;
      globallyReachable = ruleReachability;
    }
  }
  return globallyReachable;
}

function isGloballyPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const parsed = parseIpv4(address);
    return parsed === null
      ? false
      : classifyByLongestPrefix(
          IPV4_REACHABILITY_RULES,
          (network, prefix) => matchesIpv4Range(parsed, network, prefix),
          true,
        );
  }
  if (version === 6) {
    const parsed = parseIpv6(address);
    return parsed === null
      ? false
      : classifyByLongestPrefix(
          IPV6_REACHABILITY_RULES,
          (network, prefix) => matchesIpv6Range(parsed, network, prefix),
          false,
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
  if (url.protocol !== "https:" || url.username || url.password) return false;

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
  eventId?: string;
};

export async function sendWebhookRequest(
  url: string,
  secret: string,
  body: string,
  dependencies: WebhookRequestDependencies = {},
) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("webhook request timed out"));
    }, 10_000);
  });
  const request = async () => {
    if (!(await isDeliverableUrl(url, dependencies.resolver)))
      throw new Error("endpoint url must be https and publicly routable");
    if (controller.signal.aborted) throw new Error("webhook request timed out");
    const signature = await sign(secret, body);
    const response = await (dependencies.fetcher ?? fetch)(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Nadhir-Signature": `sha256=${signature}`,
        ...(dependencies.eventId
          ? {
              "Idempotency-Key": dependencies.eventId,
              "X-Nadhir-Event-Id": dependencies.eventId,
            }
          : {}),
      },
      body,
      redirect: "manual",
      signal: controller.signal,
    });
    await response.body?.cancel();
    return response;
  };
  try {
    return await Promise.race([request(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

type ClaimedWebhook = {
  id: string;
  lease_token: string;
  url: string;
  secret: string;
  payload: unknown;
};

export type WebhookDeliveryStore = {
  claim(): Promise<ClaimedWebhook | null>;
  finish(
    id: string,
    token: string,
    status: number | null,
    error: string | null,
  ): Promise<boolean>;
};

const deliveryStore: WebhookDeliveryStore = {
  async claim() {
    const { data, error } = await supabaseAdmin.rpc("claim_webhook_delivery");
    if (error) throw new Error("webhook claim failed", { cause: error });
    return data?.[0] ?? null;
  },
  async finish(id, token, status, deliveryError) {
    const { data, error } = await supabaseAdmin.rpc("finish_webhook_delivery", {
      _id: id,
      _token: token,
      _status: status,
      _error: deliveryError,
    });
    if (error) throw new Error("webhook receipt failed", { cause: error });
    return data === true;
  },
};

export async function drainWebhookDeliveries(
  dependencies: {
    store?: WebhookDeliveryStore;
    send?: typeof sendWebhookRequest;
  } = {},
) {
  const store = dependencies.store ?? deliveryStore;
  const send = dependencies.send ?? sendWebhookRequest;
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < 5; i++) {
    const item = await store.claim();
    if (!item) break;
    let status: number | null = null;
    let error: string | null = null;
    try {
      const response = await send(
        item.url,
        item.secret,
        JSON.stringify(item.payload),
        { eventId: item.id },
      );
      status = response.status;
      if (!response.ok) error = `http_${status}`;
    } catch {
      error = "delivery_failed";
    }
    if (!(await store.finish(item.id, item.lease_token, status, error)))
      throw new Error("webhook receipt lease lost");
    if (error === null && status !== null && status >= 200 && status < 300)
      sent++;
    else failed++;
  }
  return { sent, failed };
}
