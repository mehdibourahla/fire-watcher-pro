import { describe, expect, it } from "vitest";
import fixture from "./fixtures/ensemble-icon-2026-09-08.json";
import { parseEnsemble } from "@/lib/ensemble";

describe("ensemble producer contract", () => {
  it("preserves all 40 members and computes their actual hourly range", () => {
    const result = parseEnsemble(fixture, "2026-09-08");
    expect(result.hours).toHaveLength(24);
    expect(result.hours[0]!.valid_at).toBe("2026-09-08T00:00:00Z");
    expect(result.hours[0]!.temperature_2m.values).toHaveLength(40);
    expect(result.hours[0]!.temperature_2m.values.slice(0, 2)).toEqual([
      24.9, 24.7,
    ]);
    const values = result.hours[0]!.temperature_2m.values;
    expect(result.hours[0]!.temperature_2m.min).toBe(Math.min(...values));
    expect(result.hours[0]!.temperature_2m.max).toBe(Math.max(...values));
  });

  it.each([
    "missing member",
    "null member",
    "wrong unit",
    "wrong date",
    "invalid date",
    "non UTC",
  ])("rejects %s instead of silently narrowing the range", (kind) => {
    const changed = structuredClone(fixture);
    if (kind === "missing member")
      Reflect.deleteProperty(changed.hourly, "temperature_2m_member01");
    if (kind === "null member")
      (changed.hourly.temperature_2m_member01 as unknown[])[0] = null;
    if (kind === "wrong unit") changed.hourly_units.wind_speed_10m = "mp/h";
    if (kind === "wrong date") changed.hourly.time[0] = "2026-09-07T00:00";
    if (kind === "invalid date") changed.hourly.time[0] = "2026-09-31T00:00";
    if (kind === "non UTC") changed.utc_offset_seconds = 3600;
    expect(() => parseEnsemble(changed, "2026-09-08")).toThrow();
  });
});
