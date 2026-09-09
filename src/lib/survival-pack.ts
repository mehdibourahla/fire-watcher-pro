import type { OpenArea } from "@/lib/open-areas";
import type { Polygon, MultiPolygon } from "geojson";

export type SurvivalPack = {
  saved_at: string;
  lat: number;
  lon: number;
  commune: string | null;
  wilaya: string | null;
  nearest: { name: string; km: number; bearing: number } | null;
  coords: string;
  openAreas: OpenArea[];
  threats: { km: number; bearing: number; last_detected_at: string }[];
  zone_name?: string;
  area_map?: Polygon | MultiPolygon;
  shell_ready?: boolean;
};

type PackStorage = Pick<Storage, "getItem" | "setItem">;

const KEY = "nadhir.survival.pack";
export const deviceStorage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) =>
    window.localStorage.setItem(key, value),
};

export function shouldAutoPreparePack(
  pack: SurvivalPack | null,
  zone: { lat: number; lon: number; name: string },
  now = Date.now(),
): boolean {
  if (!pack) return true;
  // Visiting zone setup must preserve a pack the user selected elsewhere.
  if (
    pack.lat !== zone.lat ||
    pack.lon !== zone.lon ||
    (pack.zone_name !== undefined && pack.zone_name !== zone.name)
  )
    return false;
  const age = now - Date.parse(pack.saved_at);
  return (
    !pack.shell_ready ||
    !pack.area_map ||
    !Number.isFinite(age) ||
    age >= 86400_000
  );
}

export function savePack(storage: PackStorage, pack: SurvivalPack) {
  const serialized = JSON.stringify(pack);
  if (serialized.length > 1_000_000) throw new Error("survival.packFailed");
  storage.setItem(KEY, serialized);
}

export async function preparePack(
  storage: PackStorage,
  build: () => Promise<SurvivalPack>,
  prepareShell: () => Promise<void>,
) {
  const pack = await build();
  if (!pack.area_map || !loadPack({ getItem: () => JSON.stringify(pack) }))
    throw new Error("survival.packFailed");
  await prepareShell();
  const ready = { ...pack, shell_ready: true };
  savePack(storage, ready);
  return ready;
}

export function readSurvivalFlag(
  storage: Pick<Storage, "getItem">,
  key: string,
): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function persistSurvivalFlag(
  storage: Pick<Storage, "setItem">,
  key: string,
  value: string,
): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function loadPack(
  storage: Pick<Storage, "getItem">,
): SurvivalPack | null {
  try {
    const raw = storage.getItem(KEY);
    if (!raw || raw.length > 1_000_000) return null;
    const parsed = JSON.parse(raw) as SurvivalPack;
    const complete =
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.saved_at === "string" &&
      Number.isFinite(parsed.lat) &&
      Math.abs(parsed.lat) <= 90 &&
      Number.isFinite(parsed.lon) &&
      Math.abs(parsed.lon) <= 180 &&
      Array.isArray(parsed.openAreas) &&
      parsed.openAreas.length <= 100 &&
      parsed.openAreas.every(
        (a) =>
          typeof a.id === "string" &&
          typeof a.name === "string" &&
          Number.isFinite(a.lat) &&
          Number.isFinite(a.lon),
      ) &&
      Array.isArray(parsed.threats) &&
      parsed.threats.length <= 10 &&
      parsed.threats.every(
        (t) =>
          Number.isFinite(t.km) &&
          Number.isFinite(t.bearing) &&
          typeof t.last_detected_at === "string",
      ) &&
      typeof parsed.coords === "string";
    if (parsed.area_map) {
      const map = parsed.area_map;
      if (map.type !== "Polygon" && map.type !== "MultiPolygon") return null;
      const polygons =
        map.type === "Polygon" ? [map.coordinates] : map.coordinates;
      if (
        !Array.isArray(polygons) ||
        !polygons.length ||
        !polygons.every(
          (p) =>
            Array.isArray(p) &&
            p.length &&
            p.every(
              (r) =>
                Array.isArray(r) &&
                r.length >= 4 &&
                r.every(
                  (c) =>
                    Array.isArray(c) &&
                    c.length >= 2 &&
                    Number.isFinite(c[0]) &&
                    Number.isFinite(c[1]),
                ),
            ),
        )
      )
        return null;
    }
    return complete ? parsed : null;
  } catch {
    return null;
  }
}
