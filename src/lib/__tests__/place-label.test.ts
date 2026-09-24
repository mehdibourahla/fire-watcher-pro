import { describe, expect, it } from "vitest";

import {
  coordLabel,
  placeLabel,
  settlementName,
  wilayaGroups,
  type AdminUnit,
} from "@/lib/nadhir";

const elKala: AdminUnit = {
  id: "c1",
  level: "commune",
  code: "3601",
  name_ar: "القالة",
  name_fr: "El Kala",
  name_en: "El Kala",
  name_kab: null,
  parent_id: "w36",
  lat: 36.89,
  lon: 8.44,
  forest_fraction: 0,
  population: 60000,
};

describe("placeLabel", () => {
  it("names the commune for a domestic fire", () => {
    const label = placeLabel(
      { lat: 36.89, lon: 8.44, commune_id: "c1" },
      [elKala],
      [],
      "fr",
    );
    expect(label).toEqual({ name: "El Kala", approximate: false });
  });

  it("gives coordinates for a fire outside Algeria, even when fusion attached a commune", () => {
    const label = placeLabel(
      { lat: 36.4, lon: 9.0, commune_id: "c1" },
      [elKala],
      [],
      "fr",
    );
    expect(label).toEqual({ name: coordLabel(36.4, 9.0), approximate: false });
  });
});

describe("wilayaGroups", () => {
  const unit = (over: Partial<AdminUnit>): AdminUnit => ({
    id: "u",
    level: "commune",
    code: "0000",
    name_ar: "x",
    name_fr: "x",
    name_en: "x",
    name_kab: null,
    parent_id: null,
    lat: 36,
    lon: 4,
    forest_fraction: 0,
    population: null,
    ...over,
  });

  it("groups communes under their wilaya, ordered by code", () => {
    const w15 = unit({ id: "w15", level: "wilaya", code: "15" });
    const w06 = unit({ id: "w06", level: "wilaya", code: "06" });
    const c1 = unit({ id: "c1", code: "1501", parent_id: "w15" });
    const c2 = unit({ id: "c2", code: "0601", parent_id: "w06" });
    const orphanless = unit({ id: "w99", level: "wilaya", code: "99" });
    const groups = wilayaGroups([w15, c1, w06, c2, orphanless]);
    expect(groups.map((g) => g.wilaya.id)).toEqual(["w06", "w15"]);
    expect(groups[0]!.communes.map((c) => c.id)).toEqual(["c2"]);
    expect(groups[1]!.communes.map((c) => c.id)).toEqual(["c1"]);
  });
});

describe("settlementName", () => {
  const oran = { name: "Oran ⵡⴰⵀⵔⴻⵏ وهران", name_ar: "وهران" };
  const constantine = { name: "قسنطينة ⵇⵙⵏⵟⵉⵏⴰ", name_ar: null };

  it("keeps only the Latin part of a three-script name outside Arabic", () => {
    expect(settlementName(oran, "fr")).toBe("Oran");
    expect(settlementName(oran, "kab")).toBe("Oran");
  });

  it("falls back to the Arabic part, never Tifinagh, when no Latin name exists", () => {
    expect(settlementName(constantine, "en")).toBe("قسنطينة");
  });

  it("prefers the Arabic name in Arabic", () => {
    expect(settlementName(oran, "ar")).toBe("وهران");
    expect(settlementName(constantine, "ar")).toBe("قسنطينة");
  });

  it("names a near-settlement fire in the reader's script", () => {
    const label = placeLabel(
      { lat: 35.7, lon: -0.63, commune_id: null },
      [],
      [
        {
          id: "s1",
          name: oran.name,
          name_ar: oran.name_ar,
          place_type: "city",
          lat: 35.7,
          lon: -0.64,
          commune_id: null,
          population: null,
        },
      ],
      "en",
    );
    expect(label).toEqual({ name: "Oran", approximate: true });
  });
});
