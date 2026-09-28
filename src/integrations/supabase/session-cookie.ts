import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { NATIVE } from "@/lib/platform";

const AUTH_COOKIE = /(^|;\s*)sb-[^=;]*-auth-token(\.\d+)?=/;

export function hasStoredSession(keys: string[]): boolean {
  return keys.some((key) => /^sb-.*-auth-token$/.test(key));
}

function hasAuthCookie(cookieHeader: string | null | undefined): boolean {
  return !!cookieHeader && AUTH_COOKIE.test(cookieHeader);
}

/**
 * Presence only — never an authorization decision. It picks the route to render
 * before markup is committed; RLS and bearer checks remain the real gates.
 */
export const hasSessionCookie = createIsomorphicFn()
  .server((): boolean => {
    try {
      return hasAuthCookie(getRequestHeader("cookie"));
    } catch {
      return false;
    }
  })
  .client((): boolean =>
    NATIVE
      ? hasStoredSession(Object.keys(window.localStorage))
      : hasAuthCookie(document.cookie),
  );

export { hasAuthCookie };
