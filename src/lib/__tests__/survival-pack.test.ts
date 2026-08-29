import { describe, expect, it } from "vitest";

import { loadPack, savePack, type SurvivalPack } from "@/lib/survival-pack";

function memoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
}

const pack: SurvivalPack = {
  saved_at: "2026-08-29T12:00:00Z",
  lat: 36.52,
  lon: 4.05,
  commune: "Aït Bouadou",
  wilaya: "Tizi Ouzou",
  nearest: { name: "Aït Bouadou village", km: 2.1, bearing: 180 },
  coords: "36.5200 N · 4.0500 E",
  openAreas: [],
  threats: [
    { km: 3.6, bearing: 225, last_detected_at: "2026-08-29T11:38:00Z" },
  ],
};

describe("survival pack", () => {
  it("round-trips", () => {
    const storage = memoryStorage();
    savePack(storage, pack);
    expect(loadPack(storage)).toEqual(pack);
  });

  it("returns null when absent or corrupt", () => {
    expect(loadPack(memoryStorage())).toBeNull();
    expect(
      loadPack(memoryStorage({ "nadhir.survival.pack": "]]" })),
    ).toBeNull();
  });

  it("rejects a structurally incomplete pack", () => {
    const partial = JSON.stringify({ saved_at: "2026-08-29T12:00:00Z" });
    expect(
      loadPack(memoryStorage({ "nadhir.survival.pack": partial })),
    ).toBeNull();
  });
});
