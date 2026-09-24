import { describe, expect, it } from "vitest";
import { ADMIN_SECTIONS } from "../admin-access";
import { authDestination } from "../auth-destination";

describe("authentication destination", () => {
  it.each([
    "/alerts",
    "/settings",
    "/admin/reports",
    "/report?kind=road_blocked#details",
  ])("preserves %s", (path) => {
    expect(authDestination(path)).toBe(path);
  });
  it("preserves every admin section, so a new page is never blank after sign-in", () => {
    for (const section of ADMIN_SECTIONS)
      expect(authDestination(section.path)).toBe(section.path);
  });
  it.each([
    undefined,
    ["/alerts"],
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/auth?returnTo=/alerts",
    "/api/private/account",
    "/admin/../auth",
    "/%61uth",
    "/alerts\n",
    "/admin//evil",
  ])("rejects unsafe or unsupported destination %s", (path) => {
    expect(authDestination(path)).toBe("/zones");
  });
});
