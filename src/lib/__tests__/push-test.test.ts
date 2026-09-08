import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { auth: { getUser: mocks.getUser }, rpc: mocks.rpc },
}));
vi.mock("@/lib/ingest/fcm.server", () => ({
  fcmSend: mocks.send,
  fcmConfigured: () => true,
}));
import { handlePushTest } from "@/lib/push-test.server";

const request = (
  body: unknown = { token: "device-registration-token" },
  bearer = true,
) =>
  new Request("https://nadhir.app/api/private/push-test", {
    method: "POST",
    headers: bearer ? { authorization: "Bearer admin-session" } : {},
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "admin-id" } },
    error: null,
  });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.send.mockResolvedValue(undefined);
});
it("sends fixed test content to one token with admin and quota checks", async () => {
  const response = await handlePushTest(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.rpc).toHaveBeenCalledWith("has_any_role", {
    _user_id: "admin-id",
    _roles: ["admin"],
  });
  expect(mocks.rpc).toHaveBeenCalledWith("consume_rate_limit", {
    _bucket: "push-test:admin-id",
    _limit: 2,
    _window_seconds: 60,
  });
  expect(mocks.send).toHaveBeenCalledOnce();
  expect(mocks.send.mock.calls[0]![0]).toMatchObject({
    token: "device-registration-token",
    data: { kind: "test" },
  });
  expect(mocks.send.mock.calls[0]![0]).not.toHaveProperty("topic");
});
it("rejects missing authentication", async () => {
  expect((await handlePushTest(request({}, false))).status).toBe(401);
  expect(mocks.send).not.toHaveBeenCalled();
});
it("rejects nonadmins before sending", async () => {
  mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
  expect((await handlePushTest(request())).status).toBe(403);
  expect(mocks.send).not.toHaveBeenCalled();
});
it("fails closed on role lookup failure", async () => {
  mocks.rpc.mockResolvedValueOnce({
    data: null,
    error: { message: "offline" },
  });
  expect((await handlePushTest(request())).status).toBe(503);
  expect(mocks.send).not.toHaveBeenCalled();
});
it("enforces the quota", async () => {
  mocks.rpc
    .mockResolvedValueOnce({ data: true, error: null })
    .mockResolvedValueOnce({ data: false, error: null });
  expect((await handlePushTest(request())).status).toBe(429);
  expect(mocks.send).not.toHaveBeenCalled();
});
it("fails closed when the quota service fails", async () => {
  mocks.rpc
    .mockResolvedValueOnce({ data: true, error: null })
    .mockResolvedValueOnce({ data: null, error: { message: "offline" } });
  expect((await handlePushTest(request())).status).toBe(503);
  expect(mocks.send).not.toHaveBeenCalled();
});
it("rejects an oversized streamed body", async () => {
  expect(
    (await handlePushTest(request({ token: "x".repeat(9000) }))).status,
  ).toBe(413);
  expect(mocks.send).not.toHaveBeenCalled();
});
it.each([
  null,
  {},
  { token: "" },
  { token: "x".repeat(4097) },
  { token: "valid", topic: "public" },
])("rejects invalid or extra fields %j", async (body) => {
  expect((await handlePushTest(request(body))).status).toBe(400);
  expect(mocks.send).not.toHaveBeenCalled();
});
it("sanitizes provider failures", async () => {
  mocks.send.mockRejectedValue(new Error("sensitive-token"));
  const response = await handlePushTest(request());
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain("sensitive-token");
});
