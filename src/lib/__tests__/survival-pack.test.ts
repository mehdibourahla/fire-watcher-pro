import { describe, expect, it } from "vitest";

import {
  loadPack,
  savePack,
  preparePack,
  persistSurvivalFlag,
  type SurvivalPack,
} from "@/lib/survival-pack";

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
  it("keeps the prior pack when shell preparation fails", async () => {
    const storage = memoryStorage();
    savePack(storage, pack);
    await expect(
      preparePack(
        storage,
        async () => ({
          ...pack,
          area_map: {
            type: "Polygon",
            coordinates: [
              [
                [3, 36],
                [4, 36],
                [3, 37],
                [3, 36],
              ],
            ],
          },
        }),
        async () => {
          throw new Error("offline");
        },
      ),
    ).rejects.toThrow("offline");
    expect(loadPack(storage)).toEqual(pack);
  });
  it("does not require writable storage to activate the session", () => {
    expect(
      persistSurvivalFlag(
        {
          setItem: () => {
            throw new Error("blocked");
          },
        },
        "active",
        "yes",
      ),
    ).toBe(false);
  });
  it("marks readiness only after shell acknowledgement and successful storage", async () => {
    const storage = memoryStorage();
    const prepared = {
      ...pack,
      area_map: {
        type: "Polygon" as const,
        coordinates: [
          [
            [3, 36],
            [4, 36],
            [3, 37],
            [3, 36],
          ],
        ],
      },
    };
    const result = await preparePack(
      storage,
      async () => prepared,
      async () => {
        expect(loadPack(storage)).toBeNull();
      },
    );
    expect(result.shell_ready).toBe(true);
    expect(loadPack(storage)).toEqual(result);
  });
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

it("retains the prior pack if device quota rejects the new pack", async () => {
  const storage = memoryStorage();
  savePack(storage, pack);
  await expect(
    preparePack(
      {
        getItem: storage.getItem,
        setItem: () => {
          throw new DOMException("Quota exceeded", "QuotaExceededError");
        },
      },
      async () => ({
        ...pack,
        area_map: {
          type: "Polygon",
          coordinates: [
            [
              [3, 36],
              [4, 36],
              [3, 37],
              [3, 36],
            ],
          ],
        },
      }),
      async () => {},
    ),
  ).rejects.toThrow("Quota exceeded");
  expect(loadPack(storage)).toEqual(pack);
});
it("rejects empty geometry before requesting shell preparation", async () => {
  let shellCalled = false;
  await expect(
    preparePack(
      memoryStorage(),
      async () => ({ ...pack, area_map: { type: "Polygon", coordinates: [] } }),
      async () => {
        shellCalled = true;
      },
    ),
  ).rejects.toThrow("survival.packFailed");
  expect(shellCalled).toBe(false);
});
