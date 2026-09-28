export const NATIVE = import.meta.env.MODE === "native";
export const APP_ORIGIN: string =
  import.meta.env["VITE_APP_ORIGIN"] || "https://nadhir.app";

export function apiUrl(path: string, native = NATIVE, origin = APP_ORIGIN) {
  return native ? `${origin}${path}` : path;
}

export function publicUrl(pathAndSearch: string, origin = APP_ORIGIN) {
  return `${origin}${pathAndSearch}`;
}

const WEB_ONLY = /^\/(admin|contribute|developers|webhooks|share-card)(\/|$)/;

export function webOnlyPath(pathname: string) {
  return WEB_ONLY.test(pathname);
}
