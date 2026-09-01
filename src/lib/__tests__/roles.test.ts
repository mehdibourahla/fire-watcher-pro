import { describe, expect, it } from "vitest";

import * as roles from "@/lib/roles";

type AdminRevocationGuard = (input: {
  currentUserId: string;
  targetUserId: string;
  adminCount: number;
}) => { disabled: boolean; needsConfirmation: boolean };

type RoleMutationErrorKey = (
  error: unknown,
) => "team.lastAdminError" | "team.updateError";

const adminRevocationGuard = Reflect.get(roles, "adminRevocationGuard") as
  AdminRevocationGuard | undefined;
const roleMutationErrorKey = Reflect.get(roles, "roleMutationErrorKey") as
  RoleMutationErrorKey | undefined;

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
