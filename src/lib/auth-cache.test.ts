import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ onAuthStateChange: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
import { watchAuthCache } from "./auth-cache";

describe("identity-owned cache", () => {
  it("drops private results on account switch or logout even without a private route", () => {
    const unsubscribe = vi.fn();
    auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe } },
    });
    const client = new QueryClient();
    const stop = watchAuthCache(client);
    const event = auth.onAuthStateChange.mock.calls.at(-1)![0];
    event("INITIAL_SESSION", { user: { id: "alice" } });
    client.setQueryData(["profile"], { email: "alice@example.test" });
    client.setQueryData(["zones"], [{ name: "Alice home" }]);
    event("TOKEN_REFRESHED", { user: { id: "alice" } });
    expect(client.getQueryData(["zones"])).toEqual([{ name: "Alice home" }]);
    event("SIGNED_IN", { user: { id: "bob" } });
    expect(client.getQueryData(["profile"])).toBeUndefined();
    expect(client.getQueryData(["zones"])).toBeUndefined();
    client.setQueryData(["profile"], { email: "bob@example.test" });
    event("SIGNED_OUT", null);
    expect(client.getQueryData(["profile"])).toBeUndefined();
    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
