import { describe, expect, it } from "vitest";

import { broadcastTexts, type BroadcastVars } from "@/lib/broadcast-copy";
import type { BroadcastPhase } from "@/lib/cap";

const vars: BroadcastVars = {
  place: "عزازقة",
  wilaya: "تيزي وزو",
  km: 4.2,
  bearingDeg: 135,
  hotspots: 17,
  hours: 12,
  inside: { ar: [], fr: [], en: [], kab: [] },
};

const PHASES: BroadcastPhase[] = ["initial", "update", "end", "cancel"];

describe("broadcastTexts", () => {
  it("renders every phase in the four subscription languages", () => {
    for (const phase of PHASES) {
      const texts = broadcastTexts(phase, vars);
      expect(texts.map((t) => t.language)).toEqual([
        "ar-DZ",
        "fr-DZ",
        "en",
        "kab",
      ]);
    }
  });

  it("leaves no unfilled template slot in any variant", () => {
    const variants: BroadcastVars[] = [
      vars,
      { ...vars, km: null },
      { ...vars, bearingDeg: null },
      { ...vars, km: null, bearingDeg: null },
    ];
    for (const phase of PHASES)
      for (const v of variants)
        for (const t of broadcastTexts(phase, v)) {
          expect(t.headline).not.toContain("{{");
          expect(t.description).not.toContain("{{");
          expect(t.instruction).not.toContain("{{");
        }
  });

  it("uses the approved maquette copy for the Arabic initial", () => {
    const ar = broadcastTexts("initial", vars)[0]!;
    expect(ar.headline).toBe("حريق مؤكد — عزازقة، تيزي وزو");
    expect(ar.description).toContain("4.2");
    expect(ar.description).toContain("الجنوب الشرقي");
  });

  it("ends observation-honestly, naming the quiet hours, never all-clear", () => {
    const ar = broadcastTexts("end", vars)[0]!;
    expect(ar.headline).toContain("لا رصد جديد");
    expect(ar.description).toContain("12");
    const en = broadcastTexts("end", vars)[2]!;
    expect(en.description.toLowerCase()).not.toContain("all clear");
    expect(en.description.toLowerCase()).not.toContain("safe");
  });

  it("carries the standing-guidance instruction only while the fire is live", () => {
    expect(broadcastTexts("initial", vars)[0]!.instruction).not.toBe("");
    expect(broadcastTexts("update", vars)[1]!.instruction).not.toBe("");
    expect(broadcastTexts("end", vars)[0]!.instruction).toBe("");
    expect(broadcastTexts("cancel", vars)[3]!.instruction).toBe("");
  });

  it("drops the drift sentence when the wind direction is unknown", () => {
    const withDrift = broadcastTexts("initial", vars)[2]!;
    const noDrift = broadcastTexts("initial", {
      ...vars,
      bearingDeg: null,
    })[2]!;
    expect(withDrift.description).toContain("southeast");
    expect(noDrift.description).not.toContain("southeast");
  });
});

describe("inside communes", () => {
  const withInside: BroadcastVars = {
    ...vars,
    inside: {
      ar: ["الميلية"],
      fr: ["El Milia"],
      en: ["El Milia"],
      kab: ["El Milia"],
    },
  };
  const fr = (phase: BroadcastPhase, v: BroadcastVars) =>
    broadcastTexts(phase, v).find((t) => t.language === "fr-DZ")!.description;

  it("names the commune the fire has entered on initial and update", () => {
    for (const phase of ["initial", "update"] as const)
      expect(fr(phase, withInside)).toContain(
        "Détections à l'intérieur de la commune d'El Milia",
      );
    expect(
      fr("initial", {
        ...withInside,
        inside: { ...withInside.inside, fr: ["Texenna"] },
      }),
    ).toContain("de la commune de Texenna");
  });

  it("lists several communes", () => {
    expect(
      fr("update", {
        ...withInside,
        inside: { ...withInside.inside, fr: ["El Milia", "Texenna"] },
      }),
    ).toContain("Détections à l'intérieur des communes : El Milia, Texenna");
  });

  it("says nothing about communes on end and cancel, or when none is inside", () => {
    for (const phase of ["end", "cancel"] as const)
      expect(fr(phase, withInside)).not.toContain("intérieur");
    expect(fr("initial", vars)).not.toContain("intérieur");
  });
});
