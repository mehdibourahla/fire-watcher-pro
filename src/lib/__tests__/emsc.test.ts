import { describe, expect, it } from "vitest";

import { locateEvents, parseEmsc } from "@/lib/ingest/emsc";
import sample from "./fixtures/emsc-sample.json";

const communes = [
  { id: "setif", lat: 36.19, lon: 5.41 },
  { id: "ghazaouet", lat: 35.1, lon: -1.86 },
  { id: "alger", lat: 36.75, lon: 3.05 },
];

describe("parseEmsc", () => {
  it("keeps earthquakes and drops events of unknown type", () => {
    const events = parseEmsc(sample);
    expect(events.map((e) => e.id)).toEqual([
      "20260603_0000366",
      "20260917_0000204",
      "20260925_0000204",
      "20260915_0000006",
    ]);
    expect(events[0]).toMatchObject({
      magnitude: 4.7,
      network: expect.any(String),
      region: "NORTHERN ALGERIA",
    });
  });

  it("reads an empty poll as no events and a malformed one as an error", () => {
    expect(parseEmsc(null)).toEqual([]);
    expect(() => parseEmsc({ features: "x" })).toThrow(/unexpected/);
  });
});

describe("locateEvents", () => {
  it("keeps what is within 100 km of an Algerian commune and names that commune", () => {
    const located = locateEvents(parseEmsc(sample), communes);
    expect(located.map((e) => [e.id, e.commune_id, e.offshore])).toEqual([
      ["20260603_0000366", "setif", false],
      ["20260917_0000204", "ghazaouet", false],
      ["20260915_0000006", "alger", true],
    ]);
  });
});
