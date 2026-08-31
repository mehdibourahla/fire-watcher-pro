import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { UNREVIEWED_LOCALES } from "@/i18n/locales-list";
import {
  REVIEWABLE,
  countSubmittable,
  groupRows,
  isSubmittable,
  rowsFor,
} from "@/lib/translate";

describe("rowsFor", () => {
  it("pairs every English string with the target locale", () => {
    const rows = rowsFor("kab");
    expect(rows.length).toBeGreaterThan(500);
    expect(rows.every((r) => r.source.length > 0)).toBe(true);
  });

  it("leaves no string without a translation, which the parity test also guards", () => {
    expect(rowsFor("kab").filter((r) => r.current === "")).toHaveLength(0);
  });

  it("derives the group from the first path segment", () => {
    const row = rowsFor("fr").find((r) => r.path.startsWith("survival."));
    expect(row?.group).toBe("survival");
  });

  it("covers every locale withheld from the pickers", () => {
    for (const locale of UNREVIEWED_LOCALES) {
      expect(REVIEWABLE).toContain(locale);
    }
  });
});

describe("groupRows", () => {
  it("keeps every row and does not invent groups", () => {
    const rows = rowsFor("ar");
    const groups = groupRows(rows);
    expect(groups.flatMap((g) => g.rows)).toHaveLength(rows.length);
    expect(new Set(groups.map((g) => g.key)).size).toBe(groups.length);
  });
});

describe("isSubmittable", () => {
  it("accepts a confirmation with no text", () => {
    expect(isSubmittable({ verdict: "confirmed" })).toBe(true);
  });

  it("rejects a suggestion that is only whitespace", () => {
    expect(isSubmittable({ verdict: "suggested", suggestion: "   " })).toBe(
      false,
    );
  });

  it("counts only what would actually be sent", () => {
    expect(
      countSubmittable({
        a: { verdict: "confirmed" },
        b: { verdict: "suggested", suggestion: "" },
        c: { verdict: "suggested", suggestion: "Amek" },
      }),
    ).toBe(2);
  });
});

describe("schema agreement", () => {
  const migration = readFileSync(
    join(
      import.meta.dirname,
      "..",
      "..",
      "..",
      "supabase",
      "migrations",
      "20260830100000_c81d47f6-3b25-4a90-b7e6-0d94f5a1c837.sql",
    ),
    "utf8",
  );

  it("allows every reviewable locale", () => {
    const check = migration.match(/locale in \(([^)]*)\)/);
    const allowed = [...check![1]!.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    for (const locale of REVIEWABLE) expect(allowed).toContain(locale);
  });

  // Supabase's default privileges grant anon EXECUTE on new public functions, and
  // an anon insert policy here would let a bot write past the rate limiter.
  it("gives anon no way to write suggestions", () => {
    expect(migration).not.toMatch(/for insert to[^;]*anon/);
    expect(migration).not.toMatch(/grant[^;]*insert[^;]*to[^;]*anon/i);
  });

  it("requires a suggestion unless the verdict is a confirmation", () => {
    expect(migration).toContain(
      "check (verdict = 'confirmed' or suggestion is not null)",
    );
  });

  it("holds one opinion per reviewer per string", () => {
    expect(migration).toContain("unique (locale, key_path, reviewer_key)");
  });
});
