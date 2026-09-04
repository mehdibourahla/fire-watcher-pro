import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

const AUTH_COOKIE = /(^|;\s*)sb-[^=;]*-auth-token(\.\d+)?=/;

function hasAuthCookie(cookieHeader: string | null | undefined): boolean {
  return !!cookieHeader && AUTH_COOKIE.test(cookieHeader);
}

/**
 * Presence only — never an authorization decision. It picks the route to render
 * before markup is committed; RLS and requireSupabaseAuth remain the real gates.
 */
export const hasSessionCookie = createIsomorphicFn()
  .server((): boolean => {
    try {
      return hasAuthCookie(getRequestHeader("cookie"));
    } catch {
      return false;
    }
  })
  .client((): boolean => hasAuthCookie(document.cookie));

export { hasAuthCookie };
