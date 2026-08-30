import { describe, expect, it } from "vitest";

import { algiersToday } from "@/lib/ingest/algiers-date";

describe("algiersToday", () => {
  it("rolls to the next day at Algiers midnight, before UTC does", () => {
    expect(algiersToday(new Date("2026-08-29T23:30:00Z"))).toBe("2026-08-30");
  });

  it("matches the UTC date during the day", () => {
    expect(algiersToday(new Date("2026-08-29T12:00:00Z"))).toBe("2026-08-29");
  });
});
