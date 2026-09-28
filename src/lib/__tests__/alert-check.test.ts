import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ getUser: vi.fn(), evaluateAlerts: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { auth: { getUser: m.getUser } },
}));
vi.mock("@/lib/alerts-engine.server", () => ({
  evaluateAlerts: m.evaluateAlerts,
}));

import { handleAlertCheck } from "@/lib/alert-check.server";

const req = (authorization?: string) =>
  new Request("https://nadhir.app/api/private/alert-check", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });

beforeEach(() => {
  vi.resetAllMocks();
  m.getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
  m.evaluateAlerts.mockResolvedValue({
    evaluated: 2,
    created: 1,
    suppressed: 0,
  });
});

it("rejects a request without a bearer token", async () => {
  expect((await handleAlertCheck(req())).status).toBe(401);
  expect((await handleAlertCheck(req("Basic abc"))).status).toBe(401);
  expect(m.evaluateAlerts).not.toHaveBeenCalled();
});

it("rejects an invalid session", async () => {
  m.getUser.mockResolvedValue({
    data: { user: null },
    error: { message: "invalid" },
  });
  expect((await handleAlertCheck(req("Bearer bad"))).status).toBe(401);
  expect(m.evaluateAlerts).not.toHaveBeenCalled();
});

it("evaluates only the token owner's zones", async () => {
  const res = await handleAlertCheck(req("Bearer good"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ evaluated: 2, created: 1, suppressed: 0 });
  expect(m.getUser).toHaveBeenCalledWith("good");
  expect(m.evaluateAlerts).toHaveBeenCalledExactlyOnceWith("owner");
});
