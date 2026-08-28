import { describe, expect, it } from "vitest";

import { coordLabel, placeLabel, type AdminUnit } from "@/lib/nadhir";

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
