import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

export const THEME_COOKIE = "nadhir_theme";
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

function parse(cookieHeader: string | null | undefined): Theme {
  if (!cookieHeader) return "system";
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${THEME_COOKIE}=`));
  const value = match?.slice(THEME_COOKIE.length + 1);
  return (THEMES as readonly string[]).includes(value ?? "")
    ? (value as Theme)
    : "system";
}

/** Same value on server and client so SSR markup and hydration agree. */
export const readThemeCookie = createIsomorphicFn()
  .server((): Theme => {
    try {
      return parse(getRequestHeader("cookie"));
    } catch {
      return "system";
    }
  })
  .client((): Theme => parse(document.cookie));

export function applyTheme(theme: Theme) {
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function nextTheme(theme: Theme): Theme {
  return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length] ?? "system";
}

/* The cookie only stores the explicit choice; for "system" the class must be set
 * before first paint. RootShell inlines this script because SSR cannot know the
 * client's prefers-color-scheme. */
export const THEME_BOOT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=([^;]*)/);var t=m?m[1]:"system";var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
