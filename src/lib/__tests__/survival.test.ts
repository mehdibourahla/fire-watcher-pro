import { describe, expect, it } from "vitest";

import {
  SURVIVAL_AUTO_KM,
  checkInMessage,
  entryStatusKey,
  nearestThreat,
  positionCard,
} from "@/lib/survival";
import type { AdminUnit, FireCluster, Settlement } from "@/lib/nadhir";

const cluster = (over: Partial<FireCluster>): FireCluster => ({
  id: "c1",
  short_id: "F-1",
  state: "active",
  first_detected_at: "2026-08-29T10:00:00Z",
  last_detected_at: "2026-08-29T12:00:00Z",
  lat: 36.5,
  lon: 4.0,
  detection_count: 3,
  confirmed_at: null,
  confirmed_mention_id: null,
  sources: ["firms"],
  max_frp_mw: 10,
  confidence: 0.8,
  est_area_ha: 5,
  fci_growth: null,
  wind_speed_kmh: 20,
  wind_dir_deg: 225,
  spread_bearing_deg: null,
  wind_gust_kmh: null,
  vpd_kpa: null,
  soil_moisture_m3m3: null,
  commune_id: null,
  wilaya_id: null,
  nearest_settlement_id: null,
  nearest_settlement_km: null,
  ...over,
});

const wilaya: AdminUnit = {
  id: "w1",
  level: "wilaya",
  code: "15",
  name_ar: "تيزي وزو",
  name_fr: "Tizi Ouzou",
  name_en: "Tizi Ouzou",
  name_kab: "Tizi Wezzu",
  parent_id: null,
  lat: 36.7,
  lon: 4.05,
  forest_fraction: 0,
  population: null,
};

const commune: AdminUnit = {
  id: "u1",
  level: "commune",
  code: "1529",
  name_ar: "آيت بوعدو",
  name_fr: "Aït Bouadou",
  name_en: "Ait Bouadou",
  name_kab: "At Buɛddu",
  parent_id: "w1",
  lat: 36.52,
  lon: 4.05,
  forest_fraction: 0,
  population: null,
};

const settlement: Settlement = {
  id: "s1",
  name: "Aït Bouadou village",
  name_ar: null,
  place_type: "village",
  lat: 36.54,
  lon: 4.05,
  commune_id: "u1",
  population: null,
};

describe("nearestThreat", () => {
  it("picks the nearest live cluster and ignores ended ones", () => {
    const near = cluster({ id: "near", lat: 36.51, lon: 4.0 });
    const far = cluster({ id: "far", lat: 37.5, lon: 5.0 });
    const dead = cluster({
      id: "dead",
      lat: 36.5,
      lon: 4.0,
      state: "extinguished",
    });
    const threat = nearestThreat(36.5, 4.0, [far, dead, near]);
    expect(threat?.cluster.id).toBe("near");
    expect(threat!.km).toBeLessThan(2);
  });

  it("returns null when no live cluster exists", () => {
    expect(
      nearestThreat(36.5, 4.0, [cluster({ state: "false_positive" })]),
    ).toBeNull();
  });

  it("reports bearing from the user toward the fire", () => {
    const west = cluster({ lat: 36.5, lon: 3.9 });
    const threat = nearestThreat(36.5, 4.0, [west]);
    expect(threat!.bearing).toBeGreaterThan(250);
    expect(threat!.bearing).toBeLessThan(290);
  });

  it("flags closing when spread bearing points at the user", () => {
    const towardUser = cluster({ lat: 36.5, lon: 3.9, spread_bearing_deg: 90 });
    const awayFromUser = cluster({
      lat: 36.5,
      lon: 3.9,
      spread_bearing_deg: 270,
    });
    const unknown = cluster({ lat: 36.5, lon: 3.9 });
    expect(nearestThreat(36.5, 4.0, [towardUser])!.closing).toBe(true);
    expect(nearestThreat(36.5, 4.0, [awayFromUser])!.closing).toBe(false);
    expect(nearestThreat(36.5, 4.0, [unknown])!.closing).toBeNull();
  });

  it("keeps the auto-entry radius at 10 km", () => {
    expect(SURVIVAL_AUTO_KM).toBe(10);
  });

  it("treats a distant fire as no threat at all", () => {
    const far = cluster({ lat: 45.0, lon: 20.0 });
    expect(nearestThreat(36.5, 4.0, [far])).toBeNull();
  });
});

describe("positionCard", () => {
  it("names the nearest commune, its wilaya and the nearest settlement", () => {
    const card = positionCard(
      36.521,
      4.052,
      [wilaya, commune],
      [settlement],
      "fr",
    );
    expect(card.commune).toBe("Aït Bouadou");
    expect(card.wilaya).toBe("Tizi Ouzou");
    expect(card.nearest?.name).toBe("Aït Bouadou village");
    expect(card.nearest!.km).toBeGreaterThan(1.5);
    expect(card.nearest!.km).toBeLessThan(2.7);
  });

  it("gives the user's offset from the settlement, not the reverse", () => {
    const card = positionCard(
      36.52,
      4.05,
      [wilaya, commune],
      [settlement],
      "fr",
    );
    expect(card.nearest!.bearing).toBeGreaterThan(150);
    expect(card.nearest!.bearing).toBeLessThan(210);
  });

  it("returns nulls when everything is far away", () => {
    const card = positionCard(28.0, 1.0, [wilaya, commune], [settlement], "fr");
    expect(card.commune).toBeNull();
    expect(card.wilaya).toBeNull();
    expect(card.nearest).toBeNull();
  });

  it("formats coordinates readable aloud", () => {
    const card = positionCard(36.5231, 4.0517, [], [], "en");
    expect(card.coords).toBe("36.5231 N · 4.0517 E");
  });
});

describe("checkInMessage", () => {
  const t = (k: string, o?: Record<string, unknown>) =>
    `${k}|${JSON.stringify(o ?? {})}`;
  const card = positionCard(
    36.521,
    4.052,
    [wilaya, commune],
    [settlement],
    "en",
  );

  it("builds the OK message with place, coords and time", () => {
    const msg = checkInMessage({
      kind: "ok",
      name: "Mehdi",
      card,
      time: "20:48",
      t,
    });
    expect(msg.startsWith("Mehdi: ")).toBe(true);
    expect(msg).toContain("survival.checkin.msgOk");
    expect(msg).toContain("36.5210 N · 4.0520 E");
    expect(msg).toContain("20:48");
  });

  it("uses the assist key for the assistance state", () => {
    const msg = checkInMessage({
      kind: "assist",
      name: null,
      card,
      time: "20:48",
      t,
    });
    expect(msg).toContain("survival.checkin.msgAssist");
    expect(msg.startsWith("survival.")).toBe(true);
  });

  it("falls back to bare coordinates when no place is known", () => {
    const remote = positionCard(28.0, 1.0, [], [], "en");
    const msg = checkInMessage({
      kind: "ok",
      name: null,
      card: remote,
      time: "20:48",
      t,
    });
    expect(msg).toContain("28.0000 N · 1.0000 E");
  });
});

describe("entryStatusKey", () => {
  it("never claims a saved pack or a position it does not have", () => {
    expect(entryStatusKey(false, false, false)).toBe("survival.enterFetching");
    expect(entryStatusKey(false, true, false)).toBe("survival.enterDenied");
    expect(entryStatusKey(true, false, false)).toBe("survival.enterSaving");
    expect(entryStatusKey(true, false, true)).toBe("survival.enterReady");
  });

  it("reports denial even once a stale pack exists", () => {
    expect(entryStatusKey(false, true, true)).toBe("survival.enterDenied");
  });
});
