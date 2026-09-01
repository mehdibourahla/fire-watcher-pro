import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ar } from "@/i18n/locales/ar";
import { en } from "@/i18n/locales/en";
import { fr } from "@/i18n/locales/fr";
import { kab } from "@/i18n/locales/kab";

type Tree = { [k: string]: string | Tree };

function flatten(obj: Tree, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null
      ? flatten(v, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) return entry === "ui" ? [] : walk(p);
    return /\.tsx?$/.test(p) && !p.includes("__tests__") ? [p] : [];
  });
}

const KEYS = new Set(flatten(en as unknown as Tree));

describe("locale parity", () => {
  const locales = { ar, fr, kab } as unknown as Record<string, Tree>;
  for (const [name, table] of Object.entries(locales)) {
    it(`${name} has exactly the same keys as en`, () => {
      const theirs = new Set(flatten(table));
      expect([...KEYS].filter((k) => !theirs.has(k))).toEqual([]);
      expect([...theirs].filter((k) => !KEYS.has(k))).toEqual([]);
    });
  }
});

describe("every referenced key exists", () => {
  it("no component references a missing translation key", () => {
    const missing: string[] = [];
    for (const file of walk("src")) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)) {
        const key = m[1]!;
        if (!KEYS.has(key)) missing.push(`${file}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("no route head references a missing translation key", () => {
    const missing: string[] = [];
    for (const file of walk("src")) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(
        /\b(?:pageMeta|titledMeta)\(\s*"([a-zA-Z0-9_.]+)"(?:\s*,\s*"([a-zA-Z0-9_.]+)")?/g,
      )) {
        for (const key of [m[1], m[2]]) {
          if (key && !KEYS.has(key)) missing.push(`${file}: ${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
