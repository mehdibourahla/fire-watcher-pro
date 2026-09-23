import { describe, expect, it } from "vitest";

import { buildPlaceIndex, searchPlaces } from "@/lib/civil-location";

const unit = (
  id: string,
  name_fr: string,
  name_ar: string,
  parent_id: string | null = null,
) => ({
  id,
  name_fr,
  name_ar,
  name_en: name_fr,
  level: parent_id ? "commune" : "wilaya",
  parent_id,
});

const index = buildPlaceIndex({
  units: [
    unit("alger", "Alger", "الجزائر"),
    unit("setif", "Sétif", "سطيف"),
    unit("tipaza", "Tipaza", "تيبازة"),
    unit("boumerdes", "Boumerdès", "بومرداس"),
    unit("attatba", "Attatba", "حطاطبة", "tipaza"),
    unit("tagourait", "Aïn Tagourait", "عين تقورايت", "tipaza"),
    unit("bouismail", "Bou Ismaïl", "بو إسماعيل", "tipaza"),
    unit("douera", "Douera", "دويرة", "alger"),
    unit("khraissia", "Khraïssia", "خرايسية", "alger"),
    unit("saoula", "Saoula", "سحاولة", "alger"),
    unit("arnat", "Aïn Arnat", "عين أرنات", "setif"),
    unit("keddara", "Bouzegza Keddara", "بوزقزة قدارة", "boumerdes"),
    unit("saida", "Saïda", "سعيدة"),
    unit("ouledbrahim", "Ouled Brahim", "أولاد ابراھيم", "saida"),
    unit("chlef", "Chlef", "الشلف"),
    unit("ouedsly", "Oued Sly", "وادي سلي", "chlef"),
  ],
  aliases: [{ admin_unit_id: "keddara", alias_ar: "قدارة" }],
  settlements: [
    {
      name: "Birtouta ⴱⴻⵔⵜⵓⵜⴰ بئر توتة",
      name_ar: "بئر توتة",
      place_type: "town",
      commune_id: "khraissia",
    },
    {
      name: "Baba Ali",
      name_ar: "بابا علي",
      place_type: "village",
      commune_id: "saoula",
    },
    {
      name: "Aïn Zada",
      name_ar: "عين زادة",
      place_type: "village",
      commune_id: "arnat",
    },
    {
      name: "Bou Ismail",
      name_ar: "بوسماعيل",
      place_type: "hamlet",
      commune_id: "keddara",
    },
    {
      name: "Touta",
      name_ar: "التوتة",
      place_type: "village",
      commune_id: "ouledbrahim",
    },
    {
      name: "Doui",
      name_ar: null,
      place_type: "village",
      commune_id: "ouedsly",
    },
  ],
});

const ids = (query: string, parent: string | null = null) =>
  searchPlaces(index, query, parent).map((area) => area.id);

describe("civil place search", () => {
  it("finds a commune written with the article or the Algerian gaf", () => {
    expect(ids("الحطاطبة")[0]).toBe("attatba");
    expect(ids("عين تڤورايت")[0]).toBe("tagourait");
  });

  it("ranks a spelling variant above a short name it happens to contain", () => {
    expect(ids("Douira")[0]).toBe("douera");
  });

  it("reaches a locality through the commune that contains it", () => {
    expect(searchPlaces(index, "بئر توتة", null)[0]).toMatchObject({
      id: "khraissia",
      wilaya: "Alger",
      matched: "بئر توتة (town)",
    });
    expect(ids("Birtouta")[0]).toBe("khraissia");
    expect(ids("باباعلي")[0]).toBe("saoula");
  });

  it("names each result's wilaya so a homonym can be told apart", () => {
    const results = searchPlaces(index, "بوسماعيل", null);
    expect(results.map((area) => [area.id, area.wilaya]).slice(0, 2)).toEqual(
      expect.arrayContaining([
        ["bouismail", "Tipaza"],
        ["keddara", "Boumerdès"],
      ]),
    );
  });

  it("keeps only places under the requested parent", () => {
    expect(ids("عين زادة", "setif")).toEqual(["arnat"]);
    expect(ids("عين زادة", "alger")).toEqual([]);
  });

  it("matches a gazetteer alias", () => {
    expect(ids("قدارة")[0]).toBe("keddara");
  });
});
