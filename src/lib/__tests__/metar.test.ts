import { describe, expect, it } from "vitest";

import { isSandstorm, parseMetar } from "@/lib/ingest/metar";
// real aviationweather.gov rows; DAAT was modified into a sandstorm (SA, 400 m), none occurred that day
import sample from "./fixtures/metar-sample.json";

describe("parseMetar", () => {
  it("keeps every Algerian report once, older ones included", () => {
    const rows = parseMetar([...sample, sample[0]]);
    expect(rows.map((r) => `${r.station} ${r.observed_at}`)).toEqual([
      "DAAJ 2026-09-25T17:00:00.000Z",
      "DAAG 2026-09-25T15:30:00.000Z",
      "DAAG 2026-09-25T17:00:00.000Z",
      "DAAT 2026-09-25T17:00:00.000Z",
    ]);
  });

  it("reads visibility in metres from the report itself", () => {
    const byStation = new Map(parseMetar(sample).map((r) => [r.station, r]));
    expect(byStation.get("DAAJ")).toMatchObject({
      visibility_m: 7000,
      weather: "TS",
      name: "Djanet/Tiska Arpt",
    });
    expect(byStation.get("DAAG")?.visibility_m).toBe(9999);
    expect(byStation.get("DAAT")).toMatchObject({
      visibility_m: 400,
      gust_kt: 35,
    });
  });

  it("calls a sandstorm only dust or sand with visibility under 1 km", () => {
    const byStation = new Map(parseMetar(sample).map((r) => [r.station, r]));
    expect(isSandstorm(byStation.get("DAAT")!)).toBe(true);
    expect(isSandstorm(byStation.get("DAAJ")!)).toBe(false);
    expect(isSandstorm({ ...byStation.get("DAAT")!, visibility_m: 3000 })).toBe(
      false,
    );
  });

  it("skips a station code the table would refuse instead of failing the batch", () => {
    const odd = { ...sample[0], icaoId: "DA1" };
    expect(parseMetar([odd, ...sample]).map((r) => r.station)).not.toContain(
      "DA1",
    );
  });

  it("fails loudly on an unexpected answer", () => {
    expect(() => parseMetar({ data: [] })).toThrow(/unexpected/);
  });
});
