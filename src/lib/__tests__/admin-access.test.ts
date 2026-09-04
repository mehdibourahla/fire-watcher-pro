import { describe, expect, it } from "vitest";

import { ADMIN_SECTIONS, canReachPanel, sectionsFor } from "@/lib/admin-access";
import { adminEn } from "@/i18n/admin/en";

describe("admin access", () => {
  it("gives a translator the queues and nothing operational", () => {
    expect(sectionsFor(["translator"]).map((s) => s.key)).toEqual([
      "triage",
      "queues",
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

  it("marks only the sections that have a route as ready", () => {
    const ready = ADMIN_SECTIONS.filter((s) => s.ready).map((s) => s.key);
    expect(ready).toEqual([
      "triage",
      "sources",
      "fires",
      "risk",
      "incidents",
      "queues",
      "people",
      "audit",
    ]);
  });

  it("has a nav label for every section", () => {
    for (const section of ADMIN_SECTIONS) {
      expect(adminEn.nav).toHaveProperty(section.key);
    }
  });
});
