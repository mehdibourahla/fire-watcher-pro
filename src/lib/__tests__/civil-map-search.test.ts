import { expect, it } from "vitest";
import { parseMapSearch } from "../civil-map-search";

it("preserves shareable place, record and supported filters", () => {
  expect(
    parseMapSearch({
      area: "commune-1",
      event: "weather:warning-1",
      hazard: "weather",
      ended: true,
      candidates: "true",
    }),
  ).toEqual({
    area: "commune-1",
    event: "weather:warning-1",
    hazard: "weather",
    ended: true,
    candidates: true,
  });
});
it("discards invalid search types and rejects truthy false strings", () => {
  expect(
    parseMapSearch({
      area: [],
      event: {},
      hazard: "invented",
      ended: "false",
      candidates: 1,
    }),
  ).toEqual({ hazard: "all", ended: false, candidates: false });
});
