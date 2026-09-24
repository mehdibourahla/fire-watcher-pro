import { describe, expect, it } from "vitest";

import { adminEn } from "@/i18n/admin/en";
import { adminFr } from "@/i18n/admin/fr";
import { REVIEWABLE, rowsFor } from "@/lib/translate";

const leaves = (tree: object, prefix = ""): string[] =>
  Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : leaves(value as object, path);
  });

describe("admin namespace", () => {
  // en.ts still carries an admin.* block for the old moderation console. Milestone 2 moves it
  // here and deletes it there; until then only the new bundle's keys can be asserted absent.
  it("never reaches a translator's review queue", () => {
    const owned = new Set(leaves(adminEn).map((path) => `admin.${path}`));
    for (const locale of REVIEWABLE) {
      const leaked = rowsFor(locale)
        .map((row) => row.path)
        .filter((path) => owned.has(path));
      expect(leaked).toEqual([]);
    }
  });

  it("has a French string for every English one", () => {
    expect(leaves(adminFr).sort()).toEqual(leaves(adminEn).sort());
  });

  it("leaves no French string identical to its English source", () => {
    const shared = leaves(adminEn).filter((path) => {
      const read = (tree: object) =>
        path
          .split(".")
          .reduce<unknown>((acc, key) => (acc as never)[key], tree);
      return read(adminEn) === read(adminFr);
    });
    expect(shared).toEqual([
      "nav.sources",
      "nav.incidents",
      "ita.tabs.publications",
      "ita.wilaya",
      "ita.incidents",
      "ita.incidents_other",
      "reportsPage.km",
      "translationsPage.suggestions",
      "translationsPage.suggestions_other",
      "groups.admin",
      "audit.domain_sources",
      "audit.domain_incidents",
      "fires.reason",
      "sources.channel_telegram",
      "sources.title",
      "sources.colSource",
      "incidents.detail",
      "incidents.tier_national",
      "incidents.tier_wilaya",
      "places.openMap",
    ]);
  });
});
