import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { NATIVE } from "@/lib/platform";

const THEME_COOKIE = "nadhir_theme";
const THEME_KEY = "nadhir.theme";
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export function parseTheme(value: string | null | undefined): Theme {
  return (THEMES as readonly string[]).includes(value ?? "")
    ? (value as Theme)
    : "system";
}

function parse(cookieHeader: string | null | undefined): Theme {
  if (!cookieHeader) return "system";
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${THEME_COOKIE}=`));
  return parseTheme(match?.slice(THEME_COOKIE.length + 1));
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
  .client((): Theme =>
    NATIVE
      ? parseTheme(window.localStorage.getItem(THEME_KEY))
      : parse(document.cookie),
  );

export function applyTheme(theme: Theme) {
  if (NATIVE) window.localStorage.setItem(THEME_KEY, theme);
  else
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
const THEME_BOOT_READ = NATIVE
  ? `var t=localStorage.getItem("${THEME_KEY}")||"system";`
  : `var m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=([^;]*)/);var t=m?m[1]:"system";`;

export const THEME_BOOT_SCRIPT = `(function(){try{${THEME_BOOT_READ}var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
