import { describe, expect, it } from "vitest";

import { authErrorKey } from "@/lib/auth-errors";

describe("authErrorKey", () => {
  it("maps known credential failures to their own copy", () => {
    expect(authErrorKey({ code: "invalid_credentials" })).toBe(
      "account.errorInvalidCredentials",
    );
    expect(authErrorKey({ code: "email_not_confirmed" })).toBe(
      "account.errorEmailNotConfirmed",
    );
  });

  it("reports transport and unknown failures as a service outage", () => {
    expect(authErrorKey(new TypeError("name resolution failed"))).toBe(
      "account.errorUnavailable",
    );
    expect(authErrorKey({ code: "some_future_code" })).toBe(
      "account.errorUnavailable",
    );
    expect(authErrorKey(null)).toBe("account.errorUnavailable");
  });

  it("never returns provider wording", () => {
    const err = { code: "unmapped", message: "name resolution failed" };
    expect(authErrorKey(err)).not.toContain("resolution");
  });
});
