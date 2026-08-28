import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { LOCALES, type Locale } from "./locales-list";

export const LOCALE_COOKIE = "nadhir_locale";

function parse(cookieHeader: string | null | undefined): Locale {
  if (!cookieHeader) return "ar";
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
  const value = match?.slice(LOCALE_COOKIE.length + 1);
  return (LOCALES as readonly string[]).includes(value ?? "")
    ? (value as Locale)
    : "ar";
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
  .client((): Locale => parse(document.cookie));

export function writeLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}
