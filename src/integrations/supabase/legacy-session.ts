import { supabase } from "./client";
import { hasAuthCookie } from "./session-cookie";

/**
 * Sessions used to live in localStorage, which the server cannot read. Hand any
 * surviving one to the SDK so it is rewritten as a cookie instead of stranding a
 * signed-in user at /auth. Safe to drop once no legacy sessions remain.
 */
export async function migrateLegacySession(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (hasAuthCookie(document.cookie)) return false;

  const key = Object.keys(window.localStorage).find((k) =>
    /^sb-.*-auth-token$/.test(k),
  );
  if (!key) return false;

  try {
    const raw = window.localStorage.getItem(key);
    const stored = raw ? JSON.parse(raw) : null;
    const access_token = stored?.access_token;
    const refresh_token = stored?.refresh_token;
    if (!access_token || !refresh_token) return false;

    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (error) return false;
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
