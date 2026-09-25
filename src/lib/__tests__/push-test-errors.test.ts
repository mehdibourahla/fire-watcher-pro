import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { adminEn } from "@/i18n/admin/en";
import { pushTestErrorKey } from "@/lib/push";

const lookup = (key: string) =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      adminEn,
    );

describe("admin error messages", () => {
  it("maps each push-test failure to a message an operator can act on", () => {
    expect([401, 403, 429, 400, 413, 502, 503].map(pushTestErrorKey)).toEqual([
      "sources.pushTestErrors.signIn",
      "sources.pushTestErrors.forbidden",
      "sources.pushTestErrors.wait",
      "sources.pushTestErrors.invalid",
      "sources.pushTestErrors.invalid",
      "sources.pushTestErrors.unavailable",
      "sources.pushTestErrors.unavailable",
    ]);
  });

  it("never points at a missing string", () => {
    for (const key of [
      "sources.pushTestErrors.notifications",
      "sources.pushTestErrors.signIn",
      "sources.pushTestErrors.forbidden",
      "sources.pushTestErrors.wait",
      "sources.pushTestErrors.invalid",
      "sources.pushTestErrors.unavailable",
      "sources.pushTestCheckFailed",
      "reportsPage.moderateForbidden",
      "reportsPage.moderateGone",
      "reportsPage.moderateFailed",
    ])
      expect(typeof lookup(key), key).toBe("string");
  });
});
