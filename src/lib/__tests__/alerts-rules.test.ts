import { describe, expect, it } from "vitest";

import {
  ALERTING_STATES,
  MIN_CONFIDENCE,
  compass,
  downwindOf,
  inQuietHours,
} from "@/lib/alerts-rules";

// Africa/Algiers is UTC+1 year-round, so Algiers hour = UTC hour + 1.
const algiers = (hour: number) =>
  new Date(Date.UTC(2026, 7, 28, (hour + 23) % 24, 30));

describe("alert gating", () => {
  it("never alerts on an unconfirmed cluster (spec 8.3)", () => {
    expect(ALERTING_STATES).toEqual(["active"]);
    expect(ALERTING_STATES).not.toContain("unconfirmed");
  });

  it("uses the spec default confidence floor", () => {
    expect(MIN_CONFIDENCE).toBe(0.6);
  });
});

describe("inQuietHours", () => {
  it("is inactive when unset", () => {
    expect(inQuietHours(null, null, algiers(3))).toBe(false);
    expect(inQuietHours(22, 22, algiers(22))).toBe(false);
  });

  it("handles a same-day window", () => {
    expect(inQuietHours(1, 5, algiers(3))).toBe(true);
    expect(inQuietHours(1, 5, algiers(1))).toBe(true);
    expect(inQuietHours(1, 5, algiers(5))).toBe(false);
    expect(inQuietHours(1, 5, algiers(12))).toBe(false);
  });

  it("handles an overnight window that wraps midnight", () => {
    expect(inQuietHours(22, 6, algiers(23))).toBe(true);
    expect(inQuietHours(22, 6, algiers(0))).toBe(true);
    expect(inQuietHours(22, 6, algiers(5))).toBe(true);
    expect(inQuietHours(22, 6, algiers(6))).toBe(false);
    expect(inQuietHours(22, 6, algiers(14))).toBe(false);
  });
});

describe("downwindOf", () => {
  it("is false without a spread bearing", () => {
    expect(downwindOf(null, 90)).toBe(false);
  });

  it("accepts targets inside the +/-45 degree cone", () => {
    expect(downwindOf(90, 90)).toBe(true);
    expect(downwindOf(90, 130)).toBe(true);
    expect(downwindOf(90, 50)).toBe(true);
  });

  it("rejects targets outside the cone", () => {
    expect(downwindOf(90, 140)).toBe(false);
    expect(downwindOf(90, 270)).toBe(false);
  });

  it("wraps correctly across north", () => {
    expect(downwindOf(350, 20)).toBe(true);
    expect(downwindOf(10, 340)).toBe(true);
    expect(downwindOf(350, 60)).toBe(false);
  });
});

describe("compass", () => {
  it("labels the eight points and wraps", () => {
    expect(compass(0)).toBe("N");
    expect(compass(45)).toBe("NE");
    expect(compass(180)).toBe("S");
    expect(compass(359)).toBe("N");
    expect(compass(-90)).toBe("W");
  });
});
