import { beforeEach, describe, expect, it, vi } from "vitest";

const { adminRpc, fcmConfigured, fcmSubscribeTopics } = vi.hoisted(() => ({
  adminRpc: vi.fn(),
  fcmConfigured: vi.fn(),
  fcmSubscribeTopics: vi.fn(),
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: adminRpc },
}));

vi.mock("@/lib/ingest/fcm.server", () => ({
  fcmConfigured,
  fcmSubscribeTopics,
}));

import { Route } from "@/routes/api/public/v1/subscribe";

type Handler = (input: { request: Request }) => Promise<Response>;

function handlers() {
  return Route.options.server?.handlers as unknown as {
    ANY?: Handler;
    OPTIONS: Handler;
    POST: Handler;
  };
}

describe("public push subscription API", () => {
  beforeEach(() => {
    adminRpc.mockReset();
    fcmConfigured.mockReset();
    fcmSubscribeTopics.mockReset();
  });

  it.each(["GET", "PUT", "DELETE"])(
    "returns the POST-only JSON 405 contract for %s",
    async (method) => {
      const handler = handlers().ANY;
      expect(handler).toBeTypeOf("function");

      const response = await handler!({
        request: new Request("https://nadhir.test/api/public/v1/subscribe", {
          method,
        }),
      });

      expect(response.status).toBe(405);
      await expect(response.json()).resolves.toEqual({
        error: "method not allowed",
      });
      expect(response.headers.get("Allow")).toBe("POST, OPTIONS");
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
        "POST, OPTIONS",
      );
      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(adminRpc).not.toHaveBeenCalled();
      expect(fcmConfigured).not.toHaveBeenCalled();
      expect(fcmSubscribeTopics).not.toHaveBeenCalled();
    },
  );

  it("advertises POST in browser preflight responses", async () => {
    const response = await handlers().OPTIONS({
      request: new Request("https://nadhir.test/api/public/v1/subscribe", {
        method: "OPTIONS",
      }),
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "POST, OPTIONS",
    );
    expect(adminRpc).not.toHaveBeenCalled();
    expect(fcmConfigured).not.toHaveBeenCalled();
    expect(fcmSubscribeTopics).not.toHaveBeenCalled();
  });

  it("keeps an unconfigured POST structured and skips the provider", async () => {
    adminRpc.mockResolvedValueOnce({ data: true, error: null });
    fcmConfigured.mockReturnValueOnce(false);

    const response = await handlers().POST({
      request: new Request("https://nadhir.test/api/public/v1/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "push delivery is not configured",
    });
    expect(fcmSubscribeTopics).not.toHaveBeenCalled();
  });

  it("rejects malformed POST JSON before calling the provider", async () => {
    adminRpc.mockResolvedValueOnce({ data: true, error: null });
    fcmConfigured.mockReturnValueOnce(true);

    const response = await handlers().POST({
      request: new Request("https://nadhir.test/api/public/v1/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid JSON body",
    });
    expect(fcmSubscribeTopics).not.toHaveBeenCalled();
  });
});
