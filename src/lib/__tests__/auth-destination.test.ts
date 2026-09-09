import { describe, expect, it } from "vitest";
import { authDestination } from "../auth-destination";

describe("authentication destination", () => {
  it.each([
    "/alerts",
    "/settings",
    "/admin/queues",
    "/report?kind=road_blocked#details",
  ])("preserves %s", (path) => {
    expect(authDestination(path)).toBe(path);
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
