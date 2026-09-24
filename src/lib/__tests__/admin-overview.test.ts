import { describe, expect, it } from "vitest";

import { adminEn } from "@/i18n/admin/en";
import { OVERVIEW_ITEMS, overviewRows } from "@/lib/admin-overview";

describe("overview rows", () => {
  it("puts stopped broadcasting and failing sources before queues, and drops empty items", () => {
    const rows = overviewRows(
      {
        citizen_reports: { count: 2, oldest: "2026-09-24T10:00:00Z" },
        fires: { count: 0, oldest: null },
        sources_unhealthy: { count: 3, oldest: null },
        broadcasting_off: { count: 1, oldest: "2026-09-24T09:00:00Z" },
      },
      0,
    );
    expect(rows.map((row) => [row.item, row.tone])).toEqual([
      ["broadcasting_off", "bad"],
      ["sources_unhealthy", "bad"],
      ["citizen_reports", "neutral"],
    ]);
  });

  it("adds accepted translations that no locale file carries yet", () => {
    expect(overviewRows({}, 4)).toEqual([
      expect.objectContaining({
        item: "translations_unapplied",
        count: 4,
        path: "/admin/queues",
      }),
    ]);
  });

  it("has copy for every row it can emit", () => {
    for (const item of OVERVIEW_ITEMS)
      expect(adminEn.overview.items).toHaveProperty(item);
  });
});
