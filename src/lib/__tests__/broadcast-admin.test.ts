import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, getUserMock, insertMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
  insertMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  },
}));

import {
  applyBroadcastTransition,
  BroadcastAdminError,
  hasConfirmedBroadcastSettings,
  getBroadcastAudit,
  setBroadcastEnabled,
  submitAuthorityWarning,
} from "@/lib/broadcast-admin";

const validWarning = {
  source: "  Protection Civile  ",
  received_via: "phone",
  body: "  Close the forest road  ",
  severity: "Severe",
  wilaya_id: "wilaya-15",
};

describe("broadcast settings control plane", () => {
  beforeEach(() => {
    fromMock.mockReset();
    getUserMock.mockReset();
    insertMock.mockReset();
    rpcMock.mockReset();
  });

  it("changes state only through the actor-attributing RPC", async () => {
    const updatedAt = "2026-09-01T04:00:00.000Z";
    rpcMock.mockResolvedValue({
      data: { changed: true, enabled: false, updated_at: updatedAt },
      error: null,
    });

    await expect(setBroadcastEnabled(false)).resolves.toEqual({
      changed: true,
      enabled: false,
      updated_at: updatedAt,
    });

    expect(rpcMock).toHaveBeenCalledWith("set_broadcast_enabled", {
      _enabled: false,
    });
    expect(fromMock).not.toHaveBeenCalledWith("broadcast_settings");
  });

  it("rejects a malformed transition response instead of guessing the control state", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });

    await expect(setBroadcastEnabled(false)).rejects.toMatchObject({
      message: "broadcastAdmin.toggleFailed",
    });
  });

  it("requires confirmed, error-free settings before enabling the control", () => {
    expect(hasConfirmedBroadcastSettings(undefined, false)).toBe(false);
    expect(hasConfirmedBroadcastSettings({ enabled: false }, true)).toBe(false);
    expect(hasConfirmedBroadcastSettings({ enabled: false }, false)).toBe(true);
    expect(hasConfirmedBroadcastSettings({ enabled: true }, false)).toBe(true);
  });

  it("writes the authoritative RPC state before refreshing settings and audit", async () => {
    const calls: string[] = [];
    const queryClient = {
      setQueryData: vi.fn(() => calls.push("set")),
      invalidateQueries: vi.fn(({ queryKey }: { queryKey: string[] }) => {
        calls.push(`invalidate:${queryKey[0]}`);
        return queryKey[0] === "broadcast_settings"
          ? Promise.reject(new Error("refresh failed"))
          : Promise.resolve();
      }),
    };
    const transition = {
      changed: true,
      enabled: false,
      updated_at: "2026-09-01T04:00:00.000Z",
    };

    await expect(
      applyBroadcastTransition(queryClient, transition),
    ).resolves.toBeUndefined();

    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      ["broadcast_settings"],
      { enabled: false, updated_at: transition.updated_at },
    );
    expect(calls).toEqual([
      "set",
      "invalidate:broadcast_settings",
      "invalidate:broadcast_audit",
    ]);
  });

  it("maps toggle failures to localized guidance without exposing raw errors", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "sensitive database detail" },
    });

    const failure = await setBroadcastEnabled(false).catch((error) => error);

    expect(failure).toBeInstanceOf(BroadcastAdminError);
    expect(failure.message).toBe("broadcastAdmin.toggleFailed");
    expect(failure.message).not.toContain("sensitive database detail");
  });

  it("loads audit actors for the refreshed control-plane history", async () => {
    const result = {
      data: [{ id: "audit-1", actor_id: "admin-1" }],
      error: null,
    };
    const builder: Record<string, unknown> = {};
    builder["select"] = vi.fn(() => builder);
    builder["order"] = vi.fn(() => builder);
    builder["limit"] = vi.fn(() => builder);
    builder["then"] = (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve);
    fromMock.mockReturnValue(builder);

    await expect(getBroadcastAudit()).resolves.toEqual(result.data);

    expect(fromMock).toHaveBeenCalledWith("broadcast_audit");
    expect(builder["select"]).toHaveBeenCalledWith(
      "id, at, action, reason, kind, phase, severity, commune_codes, actor_id",
    );
  });
});

describe("authority warning submission", () => {
  beforeEach(() => {
    fromMock.mockReset();
    getUserMock.mockReset();
    insertMock.mockReset();
    rpcMock.mockReset();
  });

  it.each([
    { ...validWarning, source: " \t\n" },
    { ...validWarning, source: "\u00a0\u2003\u202f\u3000" },
    { ...validWarning, body: "\u00a0\u2003\u202f\u3000" },
  ])("rejects whitespace-only input before authentication", async (warning) => {
    await expect(submitAuthorityWarning(warning)).rejects.toMatchObject({
      message: "broadcastAdmin.warningRequired",
    });
    expect(getUserMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("trims valid text and preserves attribution, severity, and wilaya", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "admin-1" } },
      error: null,
    });
    insertMock.mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ insert: insertMock });

    await expect(submitAuthorityWarning(validWarning)).resolves.toBeUndefined();

    expect(fromMock).toHaveBeenCalledWith("authority_warnings");
    expect(insertMock).toHaveBeenCalledWith({
      source: "Protection Civile",
      received_via: "phone",
      body: "Close the forest road",
      severity: "Severe",
      wilaya_id: "wilaya-15",
      created_by: "admin-1",
    });
  });

  it("maps insert failures to localized guidance without exposing raw errors", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "admin-1" } },
      error: null,
    });
    insertMock.mockResolvedValue({
      error: { message: "authority_warnings_body_nonblank" },
    });
    fromMock.mockReturnValue({ insert: insertMock });

    const failure = await submitAuthorityWarning(validWarning).catch(
      (error) => error,
    );

    expect(failure).toBeInstanceOf(BroadcastAdminError);
    expect(failure.message).toBe("broadcastAdmin.warningFailed");
    expect(failure.message).not.toContain("authority_warnings_body_nonblank");
  });
});
