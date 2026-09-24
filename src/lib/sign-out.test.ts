import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ signOut: vi.fn(), getSession: vi.fn() }));
const push = vi.hoisted(() => ({ leaveUserPush: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("@/lib/push", () => push);
import { signOutAccount } from "./sign-out";

describe("sign-out outcome", () => {
  beforeEach(() => vi.resetAllMocks());
  it("reports complete revocation after a successful response", async () => {
    auth.signOut.mockResolvedValue({ error: null });
    expect(await signOutAccount()).toBe("global");
  });
  it("reports device-only signout when the SDK clears the session after remote failure", async () => {
    auth.signOut.mockResolvedValue({ error: new Error("unavailable") });
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    expect(await signOutAccount()).toBe("local");
  });
  it("does not report signout if a session remains or its state is unknown", async () => {
    const failure = new Error("unavailable");
    auth.signOut.mockResolvedValue({ error: failure });
    auth.getSession.mockResolvedValue({ data: { session: {} }, error: null });
    await expect(signOutAccount()).rejects.toBe(failure);
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: failure,
    });
    await expect(signOutAccount()).rejects.toBe(failure);
  });
});

describe("sign-out and this device's push", () => {
  beforeEach(() => vi.resetAllMocks());
  it("leaves the account's push topic before ending the session", async () => {
    const order: string[] = [];
    push.leaveUserPush.mockImplementation(async () => {
      order.push("leave");
    });
    auth.signOut.mockImplementation(async () => {
      order.push("signOut");
      return { error: null };
    });
    await signOutAccount();
    expect(order).toEqual(["leave", "signOut"]);
  });
  it("keeps the session when the device cannot leave the topic", async () => {
    const failure = new Error("user push failed (502)");
    push.leaveUserPush.mockRejectedValue(failure);
    await expect(signOutAccount()).rejects.toBe(failure);
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});
