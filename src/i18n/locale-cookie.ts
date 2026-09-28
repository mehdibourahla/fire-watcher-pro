import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { NATIVE } from "@/lib/platform";

import { LOCALES, type Locale } from "./locales-list";

export const LOCALE_COOKIE = "nadhir_locale";

export function parseLocale(value: string | null | undefined): Locale {
  return (LOCALES as readonly string[]).includes(value ?? "")
    ? (value as Locale)
    : "ar";
}

function parse(cookieHeader: string | null | undefined): Locale {
  if (!cookieHeader) return "ar";
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
  return parseLocale(match?.slice(LOCALE_COOKIE.length + 1));
}

/**
 * Resolve the request locale identically on the server and on the client so the
 * SSR markup and the hydrated tree render the same language.
 */
export const readLocaleCookie = createIsomorphicFn()
  .server((): Locale => {
    try {
      return parse(getRequestHeader("cookie"));
    } catch {
      return "ar";
    }
  })
  .client((): Locale =>
    NATIVE
      ? parseLocale(window.localStorage.getItem("nadhir.locale"))
      : parse(document.cookie),
  );

export function writeLocaleCookie(locale: Locale) {
  if (NATIVE) return;
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}
