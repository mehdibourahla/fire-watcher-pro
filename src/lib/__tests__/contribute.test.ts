import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  IDEA_MAX,
  IDEA_MIN,
  LANES,
  percent,
  validateIdea,
} from "@/lib/contribute";

const base = { lane: "local", message: "x".repeat(IDEA_MIN) };

describe("validateIdea", () => {
  it("accepts a specific enough note", () => {
    expect(validateIdea(base)).toBeNull();
  });

  it("rejects a filled honeypot even when everything else is valid", () => {
    expect(validateIdea({ ...base, website: "http://spam" })).toBe("honeypot");
  });

  it("rejects a lane outside the published set", () => {
    expect(validateIdea({ ...base, lane: "marketing" })).toBe("lane");
  });

  it("counts length after trimming, so whitespace cannot pad a note", () => {
    expect(validateIdea({ ...base, message: `${" ".repeat(40)}help` })).toBe(
      "tooShort",
    );
  });

  it("rejects a note over the column limit", () => {
    expect(validateIdea({ ...base, message: "x".repeat(IDEA_MAX + 1) })).toBe(
      "tooLong",
    );
  });

  it("rejects an oversized contact", () => {
    expect(validateIdea({ ...base, contact: "a".repeat(500) })).toBe(
      "contactTooLong",
    );
  });
});

describe("percent", () => {
  it("returns 0 rather than dividing by zero when nothing exists yet", () => {
    expect(percent(0, 0)).toBe(0);
  });

  it("clamps a count that exceeds its total instead of overflowing the bar", () => {
    expect(percent(5, 2)).toBe(100);
  });

  it("rounds to whole percent", () => {
    expect(percent(1187, 1536)).toBe(77);
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
      "20260830070000_5e2a91c7-4d38-4b6a-9c15-7f2043e8bd61.sql",
    ),
    "utf8",
  );

  // A lane the UI offers but the CHECK constraint rejects fails only at insert
  // time, on a real person's submission.
  it("offers exactly the lanes the check constraint allows", () => {
    const constraint = migration.match(/lane in \(([^)]*)\)/s);
    expect(constraint).not.toBeNull();
    const allowed = [...constraint![1]!.matchAll(/'([a-z_]+)'/g)].map(
      (m) => m[1],
    );
    expect([...allowed].sort()).toEqual([...LANES].sort());
  });

  it("uses the same minimum length as the message check constraint", () => {
    expect(migration).toContain(
      `char_length(message) between ${IDEA_MIN} and ${IDEA_MAX}`,
    );
  });

  it("keeps the board readable only once a moderator publishes", () => {
    expect(migration).toContain(
      "for select to anon, authenticated using (status = 'published')",
    );
  });

  // Supabase's default privileges grant EXECUTE to anon and authenticated, so a
  // revoke that names only PUBLIC leaves the function callable through PostgREST
  // and the rate limiter in front of it skippable.
  it.each(["vote_on_idea", "consume_rate_limit"])(
    "revokes %s from anon and authenticated by name",
    (fn) => {
      const revoke = migration.match(
        new RegExp(
          `revoke all on function public\\.${fn}\\([^)]*\\)\\s*from ([^;]*);`,
        ),
      );
      expect(revoke).not.toBeNull();
      expect(revoke![1]).toContain("anon");
      expect(revoke![1]).toContain("authenticated");
      expect(migration).not.toMatch(
        new RegExp(`grant execute on function public\\.${fn}[^;]*to [^;]*anon`),
      );
    },
  );
});
