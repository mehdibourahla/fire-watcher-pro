import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("admin_units client queries", () => {
  // geom/landcover/terrain hold megabytes per page; a select("*") on this table
  // took the SSR Worker past its memory limit and 503'd every page (2026-08-29)
  it("never select * from admin_units", () => {
    const src = readFileSync(
      join(__dirname, "..", "nadhir.ts"),
      "utf8",
    ).replace(/\s+/g, " ");
    expect(src).not.toMatch(/from\("admin_units"\)\s*\.select\("\*"\)/);
    expect(src).not.toContain('from("admin_units").select("*")');
  });
});
