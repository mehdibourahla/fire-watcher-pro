import { describe, expect, it } from "vitest";

import { overlay } from "@/i18n/overlay";
import { adminFr } from "@/i18n/admin/fr";
import { adminKab } from "@/i18n/admin/kab";

describe("bundle overlay", () => {
  it("keeps every base key and lets the overlay win where it has one", () => {
    expect(
      overlay({ a: "fr", b: { c: "fr", d: "fr" } }, { b: { c: "kab" } }),
    ).toEqual({ a: "fr", b: { c: "kab", d: "fr" } });
  });

  it("gives a Kabyle operator a complete admin bundle with no English", () => {
    const merged = overlay(adminFr, adminKab);
    expect(merged.nav.people).toBe(adminFr.nav.people);
    expect(merged.sources.textRecovery.title).toBe(
      adminKab.sources.textRecovery.title,
    );
  });
});
