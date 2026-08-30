import { describe, expect, test } from "vitest";
import {
  adjustLandcoverForBurnScars,
  burnScarFuelDepletion,
  type LandcoverFractions,
} from "@/lib/zonal";

describe("Dynamic burn scar masking and fuel depletion", () => {
  test("burnScarFuelDepletion flags recent major fires in epicenters", () => {
    // Larbaâ Nath Irathen (Tizi Ouzou 2021) in 2022 vs 2026
    const at2022 = burnScarFuelDepletion(36.63, 4.2, 2022);
    const at2026 = burnScarFuelDepletion(36.63, 4.2, 2026);

    expect(at2022.activeScar?.id).toBe("DZ-2021-TIZI");
    expect(at2022.depletionFactor).toBeGreaterThan(0.5);

    // After 5 years, natural regeneration reduces the fuel depletion factor
    expect(at2026.depletionFactor).toBeLessThan(at2022.depletionFactor);
  });

  test("locations far outside known scars have 0 depletion", () => {
    // Algiers Centre
    const res = burnScarFuelDepletion(36.75, 3.05, 2026);
    expect(res.depletionFactor).toBe(0);
    expect(res.activeScar).toBeNull();
  });

  test("adjustLandcoverForBurnScars reduces tree/shrub fractions proportionally", () => {
    const raw: LandcoverFractions = {
      tree: 0.6,
      shrub: 0.2,
      grass: 0.1,
      crop: 0.05,
      built: 0.05,
      bare: 0.0,
      water: 0.0,
      other: 0.0,
    };

    // Location inside El Kala (El Tarf 2022 burn scar) evaluated in 2023
    const adjusted = adjustLandcoverForBurnScars(raw, 36.88, 8.44, 2023);
    expect(adjusted).not.toBeNull();
    expect(adjusted!.tree).toBeLessThan(raw.tree);
    expect(adjusted!.bare).toBeGreaterThan(0);
  });
});
