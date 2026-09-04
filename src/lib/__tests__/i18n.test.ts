import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import i18n from "@/i18n";
import { adminEn } from "@/i18n/admin/en";
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
const ADMIN_KEYS = new Set(flatten(adminEn as unknown as Tree));

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

describe("head titles", () => {
  const BRAND: Record<string, string> = {
    en: "Nadhir",
    fr: "Nadhir",
    kab: "Nadhir",
    ar: "نذير",
  };

  // titledMeta appends the brand, so a page key carrying it renders it twice
  it("no titledMeta key repeats the brand", () => {
    const keys = new Set<string>();
    for (const file of walk("src")) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/titledMeta\(\s*"([a-zA-Z0-9_.]+)"/g))
        keys.add(m[1]!);
    }
    expect(keys.size).toBeGreaterThan(0);

    const duplicated: string[] = [];
    for (const [lng, brand] of Object.entries(BRAND)) {
      const t = i18n.getFixedT(lng);
      for (const key of keys) {
        const title = t("meta.titleTemplate", { page: t(key) });
        if (title.split(brand).length - 1 > 1)
          duplicated.push(`${lng} ${key}: ${title}`);
      }
    }
    expect(duplicated).toEqual([]);
  });
});

describe("counted labels", () => {
  const COUNTED = [
    "map.fireCount",
    "risk.communeCount",
    "history.unlocated",
    "history.fireCount",
    "status.degradedCount",
    "account.zoneFires",
  ];

  it("uses singular grammar for one in English", () => {
    const t = i18n.getFixedT("en");
    expect(t("map.fireCount", { count: 1 })).toBe("1 fire");
    expect(t("map.fireCount", { count: 3 })).toBe("3 fires");
    expect(t("risk.communeCount", { count: 1 })).toBe("1 commune");
    expect(t("history.fireCount", { count: 1 })).toBe("1 fire");
  });

  // Arabic has plural categories en never generates; a missing one renders the key
  it("never renders a raw key for any locale or count", () => {
    for (const lng of ["ar", "fr", "en", "kab"]) {
      const t = i18n.getFixedT(lng);
      for (const key of COUNTED) {
        for (const count of [0, 1, 2, 3, 11, 100]) {
          expect(t(key, { count, km: "1.0" })).not.toBe(key);
        }
      }
    }
  });
});

describe("every referenced key exists", () => {
  it("no component references a missing translation key", () => {
    const missing: string[] = [];
    for (const file of walk("src")) {
      const src = readFileSync(file, "utf8");
      const usesAdmin = src.includes('useTranslation("admin")');
      const usesDefault = /useTranslation\(\s*\)/.test(src);
      const known = !usesAdmin
        ? KEYS
        : usesDefault
          ? new Set([...KEYS, ...ADMIN_KEYS])
          : ADMIN_KEYS;
      for (const m of src.matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g)) {
        const key = m[1]!;
        if (!known.has(key)) missing.push(`${file}: ${key}`);
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
