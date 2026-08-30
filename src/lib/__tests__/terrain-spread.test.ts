import { describe, expect, test } from "vitest";
import {
  downwindOf,
  effectiveSpreadVector,
  slopeSpreadMultiplier,
} from "@/lib/alerts-rules";
import {
  bioclimaticZone,
  evaluateRelativeRisk,
  fwiPercentile,
} from "@/lib/ingest/fwi";

describe("Terrain slope-adjusted fire spread", () => {
  test("slopeSpreadMultiplier doubles spread rate roughly every 10 degrees", () => {
    const flat = slopeSpreadMultiplier(0);
    const tenDeg = slopeSpreadMultiplier(10);
    const twentyDeg = slopeSpreadMultiplier(20);

    expect(flat).toBe(1.0);
    expect(tenDeg).toBeCloseTo(2.0, 1);
    expect(twentyDeg).toBeCloseTo(4.0, 1);
  });

  test("effectiveSpreadVector returns standard downwind bearing for flat ground", () => {
    // Wind from West (270 deg) pushes fire East (90 deg)
    const result = effectiveSpreadVector(20, 270, null);
    expect(result.effectiveBearingDeg).toBe(90);
    expect(result.spreadMultiplier).toBe(1.0);
    expect(result.coneHalfAngleDeg).toBe(45);
  });

  test("effectiveSpreadVector accounts for steep south-facing slopes and accelerates spread", () => {
    // Wind from West (270 deg) over steep south-facing mountain (Kabylie ridge)
    const terrain = {
      mean_slope_deg: 18,
      p90_slope_deg: 24,
      pct_above_20_deg: 35,
      south_facing_pct: 70,
    };

    const result = effectiveSpreadVector(15, 270, terrain);
    expect(result.spreadMultiplier).toBeGreaterThan(3.0);
    // Combined vector is pulled northward by upslope draft
    expect(result.effectiveBearingDeg).toBeLessThan(90);
    expect(result.coneHalfAngleDeg).toBe(60); // Widened due to extreme ruggedness
  });

  test("downwindOf respects custom cone half angle", () => {
    const spreadBearing = 90;
    const targetAt140 = 140; // 50 degrees difference

    expect(downwindOf(spreadBearing, targetAt140, 45)).toBe(false);
    expect(downwindOf(spreadBearing, targetAt140, 60)).toBe(true);
  });
});

describe("Arid-zone FWI percentile and anomaly calibration", () => {
  test("classifies Algerian latitudes into bioclimatic domains", () => {
    expect(bioclimaticZone(36.75)).toBe("tell_coastal"); // Algiers / Tizi Ouzou
    expect(bioclimaticZone(34.8)).toBe("steppe_plateau"); // Djelfa / M'Sila
    expect(bioclimaticZone(32.5)).toBe("saharan"); // Ghardaïa / Ouargla
  });

  test("FWI 50 is extreme anomaly in coastal tell but moderate in steppe", () => {
    const coastalPercentile = fwiPercentile(50, "tell_coastal");
    const steppePercentile = fwiPercentile(50, "steppe_plateau");

    expect(coastalPercentile).toBeGreaterThanOrEqual(90);
    expect(steppePercentile).toBeLessThan(70);
  });

  test("evaluateRelativeRisk detects extreme anomaly when steppe FWI surges above 75", () => {
    const moderateSteppe = evaluateRelativeRisk(45, 34.6);
    const extremeSteppe = evaluateRelativeRisk(80, 34.6);

    expect(moderateSteppe.anomalyClass).toBe("normal");
    expect(moderateSteppe.isAnomaly).toBe(false);

    expect(extremeSteppe.anomalyClass).toBe("extreme_anomaly");
    expect(extremeSteppe.isAnomaly).toBe(true);
  });
});
