import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, getUserMock, insertMock, updateMock, deleteMock, eqMock } =
  vi.hoisted(() => ({
    fromMock: vi.fn(),
    getUserMock: vi.fn(),
    insertMock: vi.fn(),
    updateMock: vi.fn(),
    deleteMock: vi.fn(),
    eqMock: vi.fn(),
  }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: getUserMock },
    from: fromMock,
  },
}));

import { createWebhook, deleteWebhook, updateWebhook } from "@/lib/webhooks";

const validInput = {
  label: "Dispatch",
  url: "https://hooks.example.com/nadhir",
  kinds: ["fire"],
  min_severity: 3,
};

describe("webhook client validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects zero kinds before authentication with localized guidance", async () => {
    const failure = await createWebhook({
      ...validInput,
      kinds: [],
    }).catch((error) => error);

    expect(failure).toMatchObject({
      name: "WebhookMutationError",
      message: "webhooks.kindsRequired",
    });
    expect(getUserMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("maps create failures without exposing raw database details", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    insertMock.mockResolvedValue({
      error: { message: "webhook_endpoints_kinds_nonempty" },
    });
    fromMock.mockReturnValue({ insert: insertMock });

    const failure = await createWebhook(validInput).catch((error) => error);

    expect(failure).toMatchObject({
      name: "WebhookMutationError",
      message: "webhooks.saveFailed",
    });
    expect(failure.message).not.toContain("webhook_endpoints_kinds_nonempty");
  });

  it("maps update and delete failures to safe localized keys", async () => {
    eqMock
      .mockResolvedValueOnce({ error: { message: "sensitive update detail" } })
      .mockResolvedValueOnce({ error: { message: "sensitive delete detail" } });
    updateMock.mockReturnValue({ eq: eqMock });
    deleteMock.mockReturnValue({ eq: eqMock });
    fromMock
      .mockReturnValueOnce({ update: updateMock })
      .mockReturnValueOnce({ delete: deleteMock });

    await expect(
      updateWebhook("endpoint-1", { active: false }),
    ).rejects.toMatchObject({ message: "webhooks.updateFailed" });
    await expect(deleteWebhook("endpoint-1")).rejects.toMatchObject({
      message: "webhooks.deleteFailed",
    });
  });
});
