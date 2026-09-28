export const NATIVE = import.meta.env.MODE === "native";
export const APP_ORIGIN: string =
  import.meta.env["VITE_APP_ORIGIN"] || "https://nadhir.app";

export function apiUrl(path: string, native = NATIVE, origin = APP_ORIGIN) {
  return native ? `${origin}${path}` : path;
}

export function publicUrl(pathAndSearch: string, origin = APP_ORIGIN) {
  return `${origin}${pathAndSearch}`;
}

// Capacitor hands a top-level navigation off the app origin to the system browser; iOS blocks window.open without a gesture
export function openOnWeb(pathAndSearch: string) {
  window.location.assign(publicUrl(pathAndSearch));
}

const WEB_ONLY = /^\/(admin|contribute|developers|webhooks|share-card)(\/|$)/;

export function webOnlyPath(pathname: string) {
  return WEB_ONLY.test(pathname);
}
