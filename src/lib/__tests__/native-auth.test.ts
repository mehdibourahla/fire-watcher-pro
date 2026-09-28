import { beforeEach, expect, it, vi } from "vitest";

const plugin = vi.hoisted(() => ({ browse: vi.fn(), apple: vi.fn() }));
const platform = vi.hoisted(() => ({ name: "ios" }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => platform.name },
  registerPlugin: () => plugin,
}));
const auth = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  signInWithIdToken: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));

import {
  appleSignInAvailable,
  nativeApple,
  nativeGoogle,
  signInCancelled,
} from "@/lib/native-auth";

beforeEach(() => {
  vi.resetAllMocks();
  platform.name = "ios";
  auth.signInWithOAuth.mockResolvedValue({
    data: { url: "https://auth.example/authorize?provider=google" },
    error: null,
  });
  auth.exchangeCodeForSession.mockResolvedValue({ error: null });
  auth.signInWithIdToken.mockResolvedValue({ error: null });
  auth.updateUser.mockResolvedValue({ error: null });
});

it("signs in with Google in the system browser and returns through the app's own scheme", async () => {
  plugin.browse.mockResolvedValue({
    url: "app.nadhir://auth/callback?code=abc",
  });
  await nativeGoogle();
  expect(auth.signInWithOAuth).toHaveBeenCalledWith({
    provider: "google",
    options: {
      redirectTo: "app.nadhir://auth/callback",
      skipBrowserRedirect: true,
    },
  });
  expect(plugin.browse).toHaveBeenCalledWith({
    url: "https://auth.example/authorize?provider=google",
  });
  expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
});

it("fails loudly when the provider returns an error instead of a code", async () => {
  plugin.browse.mockResolvedValue({
    url: "app.nadhir://auth/callback?error=access_denied&error_description=denied",
  });
  await expect(nativeGoogle()).rejects.toThrow("denied");
  expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
});

it("hands Apple's token to Supabase with the raw nonce the sheet was hashed from", async () => {
  plugin.apple.mockResolvedValue({
    idToken: "apple-jwt",
    givenName: "Amina",
    familyName: "Haddad",
  });
  await nativeApple();
  const { nonce } = plugin.apple.mock.calls[0]![0] as { nonce: string };
  expect(nonce).toMatch(/^[0-9a-f]{64}$/);
  expect(auth.signInWithIdToken).toHaveBeenCalledWith({
    provider: "apple",
    token: "apple-jwt",
    nonce,
  });
  expect(auth.updateUser).toHaveBeenCalledWith({
    data: { full_name: "Amina Haddad" },
  });
});

it("keeps the stored name when Apple sends none, as on every sign-in after the first", async () => {
  plugin.apple.mockResolvedValue({ idToken: "apple-jwt" });
  await nativeApple();
  expect(auth.updateUser).not.toHaveBeenCalled();
});

it("offers Apple only on iOS and tells a dismissed sheet apart from a failure", () => {
  expect(appleSignInAvailable()).toBe(true);
  platform.name = "android";
  expect(appleSignInAvailable()).toBe(false);
  expect(signInCancelled({ code: "cancelled" })).toBe(true);
  expect(signInCancelled(new Error("network"))).toBe(false);
});
