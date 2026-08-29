import type { OpenArea } from "@/lib/open-areas";

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
};

type PackStorage = Pick<Storage, "getItem" | "setItem">;

const KEY = "nadhir.survival.pack";

export function savePack(storage: PackStorage, pack: SurvivalPack) {
  storage.setItem(KEY, JSON.stringify(pack));
}

export function loadPack(storage: PackStorage): SurvivalPack | null {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SurvivalPack;
    const complete =
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.saved_at === "string" &&
      typeof parsed.lat === "number" &&
      typeof parsed.lon === "number" &&
      Array.isArray(parsed.openAreas) &&
      Array.isArray(parsed.threats);
    return complete ? parsed : null;
  } catch {
    return null;
  }
}
