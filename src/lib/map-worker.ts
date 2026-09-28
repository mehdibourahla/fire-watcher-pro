import { setWorkerUrl } from "maplibre-gl";

// maplibre only resolves its worker from http(s) script URLs; iOS serves the app from capacitor://
export function mapWorkerUrl(pageUrl: string): string | null {
  return /^https?:/.test(pageUrl)
    ? null
    : new URL("/assets/maplibre-gl-worker.mjs", pageUrl).href;
}

if (typeof window !== "undefined") {
  const url = mapWorkerUrl(window.location.href);
  if (url) setWorkerUrl(url);
}
