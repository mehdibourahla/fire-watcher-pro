import { describe, expect, it, vi } from "vitest";

import { isDeliverableUrl, sendWebhookRequest } from "@/lib/webhooks.server";

function dnsAnswers(ipv4: string[] = [], ipv6: string[] = []) {
  return {
    resolve4: vi.fn().mockResolvedValue(ipv4),
    resolve6: vi.fn().mockResolvedValue(ipv6),
  };
}

function dnsError(code: string) {
  return Object.assign(new Error(code), { code });
}

describe("isDeliverableUrl", () => {
  it("accepts public https endpoints only after public A and AAAA resolution", async () => {
    const resolver = dnsAnswers(
      ["93.184.216.34"],
      ["2606:2800:220:1:248:1893:25c8:1946"],
    );

    await expect(
      isDeliverableUrl("https://hooks.example.com/nadhir", resolver),
    ).resolves.toBe(true);
    await expect(
      isDeliverableUrl(
        "https://example.com:8443/hook",
        dnsAnswers(["93.184.216.34"]),
      ),
    ).resolves.toBe(true);
    expect(resolver.resolve4).toHaveBeenCalledWith("hooks.example.com");
    expect(resolver.resolve6).toHaveBeenCalledWith("hooks.example.com");
  });

  it("rejects non-https schemes before DNS resolution", async () => {
    const resolver = dnsAnswers(["93.184.216.34"]);
    for (const url of [
      "http://hooks.example.com/x",
      "file:///etc/passwd",
      "ftp://example.com/x",
      "not a url",
    ]) {
      await expect(isDeliverableUrl(url, resolver), url).resolves.toBe(false);
    }
    expect(resolver.resolve4).not.toHaveBeenCalled();
    expect(resolver.resolve6).not.toHaveBeenCalled();
  });

  it("rejects a DNS alias that resolves to loopback", async () => {
    await expect(
      isDeliverableUrl(
        "https://127.0.0.1.nip.io/hook",
        dnsAnswers(["127.0.0.1"]),
      ),
    ).resolves.toBe(false);
  });

  it("rejects mixed public and private DNS answers", async () => {
    await expect(
      isDeliverableUrl(
        "https://hooks.example.com/x",
        dnsAnswers(["93.184.216.34", "10.0.0.5"]),
      ),
    ).resolves.toBe(false);
  });

  it("rejects private, link-local and mapped IPv6 answers", async () => {
    for (const address of [
      "::",
      "::1",
      "::ffff:127.0.0.1",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "ff02::1",
      "2001:db8::1",
    ]) {
      await expect(
        isDeliverableUrl(
          "https://hooks.example.com/x",
          dnsAnswers([], [address]),
        ),
        address,
      ).resolves.toBe(false);
    }
  });

  it("rejects no-address and DNS failure outcomes", async () => {
    await expect(
      isDeliverableUrl("https://missing.example/x", dnsAnswers()),
    ).resolves.toBe(false);

    await expect(
      isDeliverableUrl("https://unstable.example/x", {
        resolve4: vi.fn().mockRejectedValue(dnsError("ETIMEOUT")),
        resolve6: vi.fn().mockResolvedValue(["2606:4700:4700::1111"]),
      }),
    ).resolves.toBe(false);

    await expect(
      isDeliverableUrl("https://missing.example/x", {
        resolve4: vi.fn().mockRejectedValue(dnsError("ENOTFOUND")),
        resolve6: vi.fn().mockResolvedValue(["2606:4700:4700::1111"]),
      }),
    ).resolves.toBe(false);
  });

  it("accepts a public answer when the other record family has no data", async () => {
    await expect(
      isDeliverableUrl("https://ipv4-only.example/x", {
        resolve4: vi.fn().mockResolvedValue(["93.184.216.34"]),
        resolve6: vi.fn().mockRejectedValue(dnsError("ENODATA")),
      }),
    ).resolves.toBe(true);
  });

  it("rejects non-public literal targets without DNS resolution", async () => {
    const resolver = dnsAnswers(["93.184.216.34"]);
    for (const url of [
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://10.0.0.5/x",
      "https://172.16.0.1/x",
      "https://172.31.255.255/x",
      "https://192.168.1.1/x",
      "https://0.0.0.0/x",
      "https://169.254.169.254/latest/meta-data",
      "https://192.0.2.1/x",
      "https://198.51.100.1/x",
      "https://203.0.113.1/x",
      "https://[::1]/x",
      "https://[::ffff:127.0.0.1]/x",
      "https://box.local/x",
      "https://svc.internal/x",
    ]) {
      await expect(isDeliverableUrl(url, resolver), url).resolves.toBe(false);
    }
    expect(resolver.resolve4).not.toHaveBeenCalled();
    expect(resolver.resolve6).not.toHaveBeenCalled();
  });

  it("keeps public literal addresses adjacent to private ranges", async () => {
    const resolver = dnsAnswers();
    await expect(
      isDeliverableUrl("https://172.15.0.1/x", resolver),
    ).resolves.toBe(true);
    await expect(
      isDeliverableUrl("https://172.32.0.1/x", resolver),
    ).resolves.toBe(true);
    await expect(
      isDeliverableUrl("https://192.169.1.1/x", resolver),
    ).resolves.toBe(true);
    await expect(
      isDeliverableUrl("https://[2606:4700:4700::1111]/x", resolver),
    ).resolves.toBe(true);
  });

  it("defaults reserved and non-global IPv6 space to rejection", async () => {
    const resolver = dnsAnswers();
    for (const address of [
      "::2",
      "400::1",
      "fec0::1",
      "100:0:0:1::1",
      "1fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
      "4000::1",
    ]) {
      await expect(
        isDeliverableUrl(`https://[${address}]/x`, resolver),
        address,
      ).resolves.toBe(false);
    }
  });

  it("uses the most-specific IANA reachability allocation", async () => {
    const resolver = dnsAnswers();
    const expectations = [
      ["192.0.0.8", false],
      ["192.0.0.9", true],
      ["192.0.0.10", true],
      ["192.0.0.11", false],
      ["64:ff9b::1", true],
      ["64:ff9b:1::1", false],
      ["2001:1::1", true],
      ["2001:1::4", false],
      ["2001:2::1", false],
      ["2001:3::1", true],
      ["2001:20::1", true],
      ["2001:30::1", true],
      ["2001:db8::1", false],
      ["3fff::1", false],
    ] as const;

    for (const [address, expected] of expectations) {
      const host = address.includes(":") ? `[${address}]` : address;
      await expect(
        isDeliverableUrl(`https://${host}/x`, resolver),
        address,
      ).resolves.toBe(expected);
    }
  });
});

describe("sendWebhookRequest", () => {
  it("returns redirects as failures without following the destination", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "https://127.0.0.1/admin" },
      }),
    );

    const response = await sendWebhookRequest(
      "https://hooks.example.com/nadhir",
      "webhook-secret",
      '{"alert":true}',
      { resolver: dnsAnswers(["93.184.216.34"]), fetcher },
    );

    expect(response.status).toBe(302);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "https://hooks.example.com/nadhir",
      expect.objectContaining({ method: "POST", redirect: "manual" }),
    );
  });
});
