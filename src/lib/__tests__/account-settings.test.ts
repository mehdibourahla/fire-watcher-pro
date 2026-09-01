import { beforeEach, describe, expect, it, vi } from "vitest";

const { eqMock, fromMock, getUserMock, updateMock } = vi.hoisted(() => ({
  eqMock: vi.fn(),
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: getUserMock },
    from: fromMock,
  },
}));

import * as account from "@/lib/account";

const validSettings = {
  display_name: "Nadia",
  phone: null,
  locale: "fr",
  alert_email: true,
  alert_push: false,
  min_danger_level: 3,
  quiet_hours_start: 22,
  quiet_hours_end: 6,
};

describe("profile settings mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps profile save failures without exposing backend details", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    eqMock.mockResolvedValue({
      error: { message: "profiles_locale_valid sensitive detail" },
    });
    updateMock.mockReturnValue({ eq: eqMock });
    fromMock.mockReturnValue({ update: updateMock });

    const saveProfileSettings = Reflect.get(account, "saveProfileSettings") as
      ((input: typeof validSettings) => Promise<void>) | undefined;
    const failure =
      typeof saveProfileSettings === "function"
        ? await saveProfileSettings(validSettings).catch((error) => error)
        : new Error("saveProfileSettings missing");

    expect(failure).toMatchObject({
      name: "ProfileSettingsError",
      message: "account.saveFailed",
    });
    expect(failure.message).not.toContain("profiles_locale_valid");
  });
});
