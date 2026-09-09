import { describe, expect, it, vi } from "vitest";
import { startAlertNotifications } from "@/lib/alert-notifications";

function fixture() {
  let auth: (id: string | null) => void = () => {};
  const listeners = new Map<
    string,
    (row: { id: string; title: string; body: string }) => Promise<void>
  >();
  const removed: string[] = [];
  let enabled = false;
  const show = vi.fn();
  const refresh = vi.fn();
  const stop = startAlertNotifications({
    onUser: (callback) => {
      auth = callback;
      return () => {
        auth = () => {};
      };
    },
    subscribe: (id, callback) => {
      listeners.set(id, callback);
      return () => {
        removed.push(id);
        listeners.delete(id);
      };
    },
    pushEnabled: async () => enabled,
    show,
    refresh,
  });
  return {
    signIn: (id: string | null) => auth(id),
    listeners,
    removed,
    show,
    refresh,
    stop,
    enable: () => {
      enabled = true;
    },
  };
}

describe("personal browser notification lifecycle", () => {
  it("subscribes after sign-in, respects current preference, and detaches on account changes", async () => {
    const f = fixture();
    expect(f.listeners.size).toBe(0);
    f.signIn("a");
    const old = f.listeners.get("a")!;
    await old({ id: "one", title: "alert", body: "body" });
    expect(f.refresh).toHaveBeenCalledOnce();
    expect(f.show).not.toHaveBeenCalled();
    f.enable();
    await old({ id: "two", title: "alert", body: "body" });
    expect(f.show).toHaveBeenCalledOnce();
    f.signIn("b");
    await old({ id: "old", title: "alert", body: "body" });
    expect(f.show).toHaveBeenCalledOnce();
    expect(f.removed).toEqual(["a"]);
    f.signIn(null);
    expect(f.listeners.size).toBe(0);
    f.stop();
  });

  it("suppresses a notification when sign-out happens during its preference read", async () => {
    let change!: (id: string | null) => void;
    let deliver!: (row: {
      id: string;
      title: string;
      body: string;
    }) => Promise<void>;
    let resolve!: (value: boolean) => void;
    const show = vi.fn();
    const stop = startAlertNotifications({
      onUser: (cb) => {
        change = cb;
        return () => {};
      },
      subscribe: (_id, cb) => {
        deliver = cb;
        return () => {};
      },
      pushEnabled: () =>
        new Promise<boolean>((r) => {
          resolve = r;
        }),
      show,
      refresh: () => {},
    });
    change("a");
    const pending = deliver({ id: "one", title: "alert", body: "body" });
    change(null);
    resolve(true);
    await pending;
    expect(show).not.toHaveBeenCalled();
    stop();
  });
});
