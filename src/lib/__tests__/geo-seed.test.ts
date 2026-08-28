import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

type Unit = {
  code: string | null;
  name_ar: string;
  name_fr: string;
  lat: number;
  lon: number;
  wilaya_code?: string | null;
};

type Settlement = {
  osm_id: number;
  name: string;
  lat: number;
  lon: number;
  commune_code: string | null;
};

const admin = JSON.parse(
  readFileSync("data/geo/algeria-admin.json", "utf8"),
) as { wilayas: Unit[]; communes: Unit[]; licence: string };

const settlements = (
  JSON.parse(readFileSync("data/geo/algeria-settlements.json", "utf8")) as {
    settlements: Settlement[];
  }
).settlements;

// Algeria's bounding box; anything outside means a bad coordinate pair.
const inAlgeria = (lat: number, lon: number) =>
  lat > 18 && lat < 38 && lon > -9 && lon < 12.5;

describe("wilayas", () => {
  it("covers the current 69-wilaya administrative division", () => {
    expect(admin.wilayas).toHaveLength(69);
  });

  it("has a gapless 01..69 code sequence", () => {
    const codes = admin.wilayas
      .map((w) => Number(w.code))
      .sort((a, b) => a - b);
    expect(codes).toEqual(Array.from({ length: 69 }, (_, i) => i + 1));
  });

  it("has Arabic and French names and plausible coordinates", () => {
    for (const w of admin.wilayas) {
      expect(w.name_ar, `${w.code} name_ar`).toBeTruthy();
      expect(w.name_fr, `${w.code} name_fr`).toBeTruthy();
      expect(inAlgeria(w.lat, w.lon), `${w.code} coords`).toBe(true);
    }
  });
});

describe("communes", () => {
  it("is close to the official count of 1541", () => {
    expect(admin.communes.length).toBeGreaterThan(1500);
    expect(admin.communes.length).toBeLessThanOrEqual(1541);
  });

  it("has unique ONS codes", () => {
    const codes = admin.communes.map((c) => c.code).filter(Boolean);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("resolves every commune to a seeded wilaya", () => {
    const wilayaCodes = new Set(admin.wilayas.map((w) => w.code));
    const orphans = admin.communes.filter(
      (c) => !c.wilaya_code || !wilayaCodes.has(c.wilaya_code),
    );
    expect(orphans.map((c) => c.name_fr)).toEqual([]);
  });

  it("places every commune inside Algeria", () => {
    const outside = admin.communes.filter((c) => !inAlgeria(c.lat, c.lon));
    expect(outside.map((c) => c.name_fr)).toEqual([]);
  });
});

describe("settlements", () => {
  it("is a real gazetteer, not a demo fixture", () => {
    expect(settlements.length).toBeGreaterThan(5000);
  });

  it("has unique OSM ids and a name for every entry", () => {
    const ids = settlements.map((s) => s.osm_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(settlements.every((s) => s.name)).toBe(true);
  });

  it("places every settlement inside Algeria", () => {
    expect(settlements.filter((s) => !inAlgeria(s.lat, s.lon))).toEqual([]);
  });

  it("attributes its source licence", () => {
    expect(admin.licence).toMatch(/ODbL/);
  });
});
