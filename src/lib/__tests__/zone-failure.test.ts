import { describe, expect, it } from "vitest";

import { zoneFailureKey } from "@/lib/account";

describe("zoneFailureKey", () => {
  it("names the zone limit, the one failure a user can fix", () => {
    expect(zoneFailureKey(new Error("Zone limit reached (10 total)"))).toBe(
      "account.zoneLimit",
    );
  });

  it("never shows a raw backend message", () => {
    expect(
      zoneFailureKey(new Error("new row violates row-level security")),
    ).toBe("account.zoneSaveFailed");
    expect(zoneFailureKey("offline")).toBe("account.zoneSaveFailed");
  });
});
