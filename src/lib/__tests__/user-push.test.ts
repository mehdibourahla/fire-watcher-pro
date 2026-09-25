import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  subscribe: vi.fn(),
  upsert: vi.fn(),
  deleteEq: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
    from: () => ({
      upsert: mocks.upsert,
      delete: () => ({
        eq: (a: string, x: string) => ({
          eq: (b: string, y: string) => mocks.deleteEq({ [a]: x, [b]: y }),
        }),
      }),
    }),
  },
}));
vi.mock("@/lib/ingest/fcm.server", () => ({
  fcmSubscribeTopics: mocks.subscribe,
  fcmConfigured: () => true,
}));
import { handleUserPush } from "@/lib/user-push.server";

const request = (body: unknown, bearer = true) =>
  new Request("https://nadhir.app/api/private/user-push", {
    method: "POST",
    headers: bearer ? { authorization: "Bearer user-session" } : {},
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "u1" } },
    error: null,
  });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.subscribe.mockResolvedValue(undefined);
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.deleteEq.mockResolvedValue({ error: null });
});

const hashOf = (token: string) =>
  createHash("sha256").update(token).digest("hex");

it("refuses a caller who is not signed in", async () => {
  const res = await handleUserPush(
    request({ token: "t", action: "subscribe" }, false),
  );
  expect(res.status).toBe(401);
  expect(mocks.subscribe).not.toHaveBeenCalled();
});

it("joins the caller's own topic and nobody else's", async () => {
  const res = await handleUserPush(
    request({ token: "device-token", action: "subscribe" }),
  );
  expect(res.status).toBe(200);
  expect(mocks.subscribe).toHaveBeenCalledWith(
    "device-token",
    ["v1.user.u1"],
    true,
  );
  expect(mocks.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      user_id: "u1",
      device_hash: hashOf("device-token"),
    }),
  );
});

it("leaves the topic on unsubscribe", async () => {
  await handleUserPush(
    request({ token: "device-token", action: "unsubscribe" }),
  );
  expect(mocks.subscribe).toHaveBeenCalledWith(
    "device-token",
    ["v1.user.u1"],
    false,
  );
  expect(mocks.deleteEq).toHaveBeenCalledWith({
    user_id: "u1",
    device_hash: hashOf("device-token"),
  });
});

it("rejects a body naming its own topic", async () => {
  const res = await handleUserPush(
    request({ token: "t", action: "subscribe", topic: "v1.user.someone-else" }),
  );
  expect(res.status).toBe(400);
  expect(mocks.subscribe).not.toHaveBeenCalled();
});

it("rate-limits repeated calls", async () => {
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  const res = await handleUserPush(
    request({ token: "t", action: "subscribe" }),
  );
  expect(res.status).toBe(429);
});

it("reports a push provider failure instead of pretending it worked", async () => {
  mocks.subscribe.mockRejectedValue(new Error("topic subscribe failed (500)"));
  const res = await handleUserPush(
    request({ token: "t", action: "subscribe" }),
  );
  expect(res.status).toBe(502);
  expect(mocks.upsert).not.toHaveBeenCalled();
});
