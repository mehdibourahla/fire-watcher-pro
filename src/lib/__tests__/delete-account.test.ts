import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  getUser: vi.fn(),
  deleteUser: vi.fn(),
  signOut: vi.fn(),
  roles: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    auth: {
      getUser: m.getUser,
      admin: { deleteUser: m.deleteUser, signOut: m.signOut },
    },
    from: () => ({ select: () => ({ eq: m.roles }) }),
    storage: { from: () => ({ list: m.list, remove: m.remove }) },
  },
}));
import { handleDeleteAccount } from "@/lib/delete-account.server";
const req = (body: unknown = { confirmation: "DELETE" }, token = "valid") =>
  new Request("https://nadhir.app/api/private/account", {
    method: "DELETE",
    headers: {
      origin: "https://nadhir.app",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  m.getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
  m.roles.mockResolvedValue({ data: [], error: null });
  m.list.mockResolvedValue({ data: [], error: null });
  m.signOut.mockResolvedValue({ error: null });
  m.deleteUser.mockResolvedValue({ error: null });
  m.remove.mockResolvedValue({ error: null });
});
it("requires a valid session and explicit confirmation", async () => {
  expect((await handleDeleteAccount(req({ confirmation: "no" }))).status).toBe(
    400,
  );
  m.getUser.mockResolvedValue({
    data: { user: null },
    error: { message: "invalid" },
  });
  expect((await handleDeleteAccount(req())).status).toBe(401);
  expect(m.deleteUser).not.toHaveBeenCalled();
});
it("only deletes the authenticated identity and rejects a supplied target", async () => {
  expect(
    (
      await handleDeleteAccount(
        req({ confirmation: "DELETE", user_id: "victim" }),
      )
    ).status,
  ).toBe(400);
  expect((await handleDeleteAccount(req())).status).toBe(200);
  expect(m.deleteUser).toHaveBeenCalledExactlyOnceWith("owner");
});
it("preserves the last admin and never starts photo removal", async () => {
  m.roles.mockResolvedValue({ data: [{ user_id: "owner" }], error: null });
  expect((await handleDeleteAccount(req())).status).toBe(409);
  expect(m.list).not.toHaveBeenCalled();
  expect(m.deleteUser).not.toHaveBeenCalled();
});
it("stops deletion when owned photo removal fails", async () => {
  m.list.mockResolvedValueOnce({
    data: [{ id: "object", name: "photo.jpg" }],
    error: null,
  });
  m.remove.mockResolvedValue({ error: { message: "storage down" } });
  expect((await handleDeleteAccount(req())).status).toBe(503);
  expect(m.remove).toHaveBeenCalledWith(["owner/photo.jpg"]);
  expect(m.deleteUser).not.toHaveBeenCalled();
});
it("removes nested owned photos before deleting the account", async () => {
  m.list
    .mockResolvedValueOnce({
      data: [{ id: null, name: "nested" }],
      error: null,
    })
    .mockResolvedValueOnce({
      data: [{ id: "object", name: "photo.jpg" }],
      error: null,
    });
  expect((await handleDeleteAccount(req())).status).toBe(200);
  expect(m.list).toHaveBeenNthCalledWith(2, "owner/nested", { limit: 100 });
  expect(m.remove).toHaveBeenCalledExactlyOnceWith(["owner/nested/photo.jpg"]);
  expect(m.deleteUser).toHaveBeenCalledExactlyOnceWith("owner");
});
it("rejects cross-origin deletion before looking up the session", async () => {
  const request = req();
  request.headers.set("origin", "https://foreign.example");
  expect((await handleDeleteAccount(request)).status).toBe(403);
  expect(m.getUser).not.toHaveBeenCalled();
});
