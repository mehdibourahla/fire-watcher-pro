import { describe, expect, it } from "vitest";

import { PAGE_SIZE, nextOffset, pageRange, pageRows } from "@/lib/paging";

const rows = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `r${from + i}` }));

describe("server pages", () => {
  it("asks for the next page only while pages come back full", () => {
    const full = rows(0, PAGE_SIZE);
    expect(nextOffset(full, [full])).toBe(PAGE_SIZE);
    expect(
      nextOffset(rows(PAGE_SIZE, 3), [full, rows(PAGE_SIZE, 3)]),
    ).toBeNull();
    expect(pageRange(PAGE_SIZE)).toEqual([PAGE_SIZE, 2 * PAGE_SIZE - 1]);
  });

  it("shows a row once when a new one pushed it onto the next page", () => {
    const merged = pageRows({
      pages: [rows(0, 3), [{ id: "r2" }, { id: "r3" }]],
      pageParams: [0, 3],
    });
    expect(merged.map((r) => r.id)).toEqual(["r0", "r1", "r2", "r3"]);
  });
});
