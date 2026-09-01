import { beforeEach, describe, expect, it, vi } from "vitest";

const { eq, from, select } = vi.hoisted(() => ({
  eq: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from },
}));

import * as roles from "@/lib/roles";

type AdminRevocationGuard = (input: {
  currentUserId: string;
  targetUserId: string;
  adminCount: number;
}) => { disabled: boolean; needsConfirmation: boolean };

type RoleMutationErrorKey = (
  error: unknown,
) => "team.lastAdminError" | "team.updateError";

type AdminCountQuery = {
  queryFn: () => Promise<number>;
};

type MembersQuery = {
  queryFn: () => Promise<unknown>;
};

const adminRevocationGuard = Reflect.get(roles, "adminRevocationGuard") as
  AdminRevocationGuard | undefined;
const roleMutationErrorKey = Reflect.get(roles, "roleMutationErrorKey") as
  RoleMutationErrorKey | undefined;
const adminCountQuery = Reflect.get(roles, "adminCountQuery") as unknown as
  AdminCountQuery | undefined;
const membersQuery = Reflect.get(
  roles,
  "membersQuery",
) as unknown as MembersQuery;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("adminCountQuery", () => {
  it("keeps self-revocation available when another admin is outside the 500-profile page", async () => {
    const visibleMemberIds = [
      "admin-1",
      ...Array.from({ length: 499 }, (_, index) => `member-${index}`),
    ];
    eq.mockResolvedValueOnce({ data: null, count: 2, error: null });
    select.mockReturnValueOnce({ eq });
    from.mockReturnValueOnce({ select });

    const count = await adminCountQuery?.queryFn();

    expect(visibleMemberIds).toHaveLength(500);
    expect(visibleMemberIds).not.toContain("admin-2");
    expect(count).toBe(2);
    expect(
      adminRevocationGuard?.({
        currentUserId: "admin-1",
        targetUserId: "admin-1",
        adminCount: count ?? 0,
      }),
    ).toEqual({ disabled: false, needsConfirmation: true });
    expect(from).toHaveBeenCalledWith("user_roles");
    expect(select).toHaveBeenCalledWith("id", {
      count: "exact",
      head: true,
    });
    expect(eq).toHaveBeenCalledWith("role", "admin");
  });
});

describe("membersQuery", () => {
  it("rejects when role memberships fail after profiles load", async () => {
    const profileLimit = vi.fn().mockResolvedValue({ data: [], error: null });
    const profileOrder = vi.fn().mockReturnValue({ limit: profileLimit });
    const profileSelect = vi.fn().mockReturnValue({ order: profileOrder });
    const membershipSelect = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "role memberships unavailable" },
    });
    from
      .mockReturnValueOnce({ select: profileSelect })
      .mockReturnValueOnce({ select: membershipSelect });

    await expect(membersQuery.queryFn()).rejects.toThrow(
      "role memberships unavailable",
    );
  });
});

describe("adminRevocationGuard", () => {
  it("disables self-revocation for the sole admin", () => {
    expect(
      adminRevocationGuard?.({
        currentUserId: "admin-1",
        targetUserId: "admin-1",
        adminCount: 1,
      }),
    ).toEqual({ disabled: true, needsConfirmation: false });
  });

  it("requires confirmation when one of multiple admins revokes themselves", () => {
    expect(
      adminRevocationGuard?.({
        currentUserId: "admin-1",
        targetUserId: "admin-1",
        adminCount: 2,
      }),
    ).toEqual({ disabled: false, needsConfirmation: true });
  });

  it("does not confirm revocation of another admin", () => {
    expect(
      adminRevocationGuard?.({
        currentUserId: "admin-1",
        targetUserId: "admin-2",
        adminCount: 2,
      }),
    ).toEqual({ disabled: false, needsConfirmation: false });
  });
});

describe("roleMutationErrorKey", () => {
  it("maps the terminal-admin database rejection to friendly copy", () => {
    expect(roleMutationErrorKey?.(new Error("last_admin_required"))).toBe(
      "team.lastAdminError",
    );
  });

  it("maps other failures to a generic localized error", () => {
    expect(roleMutationErrorKey?.(new Error("network unavailable"))).toBe(
      "team.updateError",
    );
  });
});
