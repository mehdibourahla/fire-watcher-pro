import { describe, expect, it, vi } from "vitest";
import {
  drainWebhookDeliveries,
  sendWebhookRequest,
  type WebhookDeliveryStore,
} from "@/lib/webhooks.server";

const item = {
  id: "event-id",
  lease_token: "lease-token",
  url: "https://example.com",
  secret: "test-secret",
  payload: { event_id: "event-id", alert: { id: "alert-id" } },
};
function store() {
  return {
    claim: vi
      .fn<WebhookDeliveryStore["claim"]>()
      .mockResolvedValueOnce(item)
      .mockResolvedValue(null),
    finish: vi.fn<WebhookDeliveryStore["finish"]>().mockResolvedValue(true),
  };
}

describe("durable webhook drain", () => {
  it("records a failed attempt for later retry and preserves the stable event id", async () => {
    const first = store();
    const send = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    expect(await drainWebhookDeliveries({ store: first, send })).toEqual({
      sent: 0,
      failed: 1,
    });
    expect(first.finish).toHaveBeenCalledWith(
      item.id,
      item.lease_token,
      503,
      "http_503",
    );
    const retry = store();
    send.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await drainWebhookDeliveries({ store: retry, send })).toEqual({
      sent: 1,
      failed: 0,
    });
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
    expect(send).toHaveBeenCalledWith(
      item.url,
      item.secret,
      JSON.stringify(item.payload),
      { eventId: item.id },
    );
  });

  it("does not report success if the receipt fails or lease was reclaimed", async () => {
    const failed = store();
    failed.finish.mockRejectedValue(new Error("database unavailable"));
    await expect(
      drainWebhookDeliveries({
        store: failed,
        send: vi.fn().mockResolvedValue(new Response()),
      }),
    ).rejects.toThrow("database unavailable");
    const stale = store();
    stale.finish.mockResolvedValue(false);
    await expect(
      drainWebhookDeliveries({
        store: stale,
        send: vi.fn().mockResolvedValue(new Response()),
      }),
    ).rejects.toThrow("lease lost");
  });

  it("stores a sanitized network error without endpoint secrets", async () => {
    const db = store();
    await drainWebhookDeliveries({
      store: db,
      send: vi.fn().mockRejectedValue(new Error("secret response")),
    });
    expect(db.finish).toHaveBeenCalledWith(
      item.id,
      item.lease_token,
      null,
      "delivery_failed",
    );
  });

  it("bounds DNS resolution and never fetches after the timeout", async () => {
    vi.useFakeTimers();
    try {
      let resolve!: (value: string[]) => void;
      const fetcher = vi.fn();
      const request = sendWebhookRequest(item.url, item.secret, "{}", {
        fetcher,
        resolver: {
          resolve4: () =>
            new Promise((r) => {
              resolve = r;
            }),
          resolve6: async () => [],
        },
      });
      const rejected = expect(request).rejects.toThrow("timed out");
      await vi.advanceTimersByTimeAsync(10_000);
      await rejected;
      resolve(["93.184.216.34"]);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends receiver deduplication headers and refuses credentials in URLs", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response());
    const resolver = {
      resolve4: async () => ["93.184.216.34"],
      resolve6: async () => [],
    };
    await sendWebhookRequest(item.url, item.secret, "{}", {
      fetcher,
      resolver,
      eventId: item.id,
    });
    expect(fetcher).toHaveBeenCalledWith(
      item.url,
      expect.objectContaining({
        headers: expect.objectContaining({
          "Idempotency-Key": item.id,
          "X-Nadhir-Event-Id": item.id,
        }),
      }),
    );
    await expect(
      sendWebhookRequest(
        "https://user:password@example.com",
        item.secret,
        "{}",
        { fetcher, resolver },
      ),
    ).rejects.toThrow("publicly routable");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
