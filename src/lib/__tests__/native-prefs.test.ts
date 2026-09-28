import { expect, it } from "vitest";

import { parseLocale } from "@/i18n/locale-cookie";
import { parseTheme } from "@/lib/theme";

it("parses a stored locale with the cookie default", () => {
  expect(parseLocale("fr")).toBe("fr");
  expect(parseLocale("kab")).toBe("ar");
  expect(parseLocale("xx")).toBe("ar");
  expect(parseLocale(null)).toBe("ar");
});

it("parses a stored theme with the cookie default", () => {
  expect(parseTheme("dark")).toBe("dark");
  expect(parseTheme("sepia")).toBe("system");
  expect(parseTheme(null)).toBe("system");
});
