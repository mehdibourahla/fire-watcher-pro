import { describe, expect, it } from "vitest";

import {
  ADMIN_GROUPS,
  ADMIN_SECTIONS,
  canReachPanel,
  sectionsFor,
} from "@/lib/admin-access";
import { adminEn } from "@/i18n/admin/en";

describe("admin access", () => {
  it.each([
    "admin",
    "operator",
    "report_moderator",
    "translator",
    "incident_editor",
  ])("exposes the panel entry to %s", (role) => {
    expect(canReachPanel([role])).toBe(true);
  });

  it("rejects unknown and obsolete roles", () => {
    expect(canReachPanel(["moderator", "unknown"])).toBe(false);
  });

  it("gives a translator translations and nothing operational", () => {
    expect(sectionsFor(["translator"]).map((s) => s.key)).toEqual([
      "overview",
      "translations",
      "audit",
    ]);
  });

  it("keeps citizen fire reports away from a translator", () => {
    const reachable = sectionsFor(["translator"]).map((s) => s.key);
    expect(reachable).not.toContain("fires");
    expect(reachable).not.toContain("people");
  });

  it("gives an admin every section", () => {
    expect(sectionsFor(["admin"]).length).toBe(ADMIN_SECTIONS.length);
  });

  it("gives a plain member nothing", () => {
    expect(sectionsFor(["user"])).toEqual([]);
    expect(canReachPanel(["user"])).toBe(false);
  });

  it("declares at least one role for every section", () => {
    for (const section of ADMIN_SECTIONS) {
      expect(section.roles.length).toBeGreaterThan(0);
    }
  });

  it("shows Broadcasts only to admins, as the page itself does", () => {
    expect(sectionsFor(["operator"]).map((s) => s.key)).not.toContain(
      "broadcasts",
    );
  });

  it("has a nav label for every section and group", () => {
    for (const section of ADMIN_SECTIONS) {
      expect(adminEn.nav).toHaveProperty(section.key);
    }
    for (const group of ADMIN_GROUPS) {
      expect(adminEn.groups).toHaveProperty(group);
    }
  });
});
