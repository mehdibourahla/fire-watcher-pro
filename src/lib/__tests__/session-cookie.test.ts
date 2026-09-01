import { describe, expect, it } from "vitest";

import { hasAuthCookie } from "@/integrations/supabase/session-cookie";

describe("hasAuthCookie", () => {
  it("detects a session cookie and its chunks", () => {
    expect(hasAuthCookie("sb-abcdefg-auth-token=x")).toBe(true);
    expect(
      hasAuthCookie("sb-abcdefg-auth-token.0=x; sb-abcdefg-auth-token.1=y"),
    ).toBe(true);
    expect(hasAuthCookie("nadhir_locale=ar; sb-abcdefg-auth-token=x")).toBe(
      true,
    );
  });

  it("is false when no session cookie is present", () => {
    expect(hasAuthCookie("")).toBe(false);
    expect(hasAuthCookie(null)).toBe(false);
    expect(hasAuthCookie(undefined)).toBe(false);
    expect(hasAuthCookie("nadhir_locale=ar; theme=dark")).toBe(false);
  });

  // a cookie whose *value* mentions the token name must not read as a session
  it("does not match the token name inside another cookie's value", () => {
    expect(hasAuthCookie("decoy=sb-abcdefg-auth-token=x")).toBe(false);
    expect(hasAuthCookie("nadhir_locale=sb-x-auth-token")).toBe(false);
  });
});
