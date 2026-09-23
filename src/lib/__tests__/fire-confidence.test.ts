import { describe, expect, it } from "vitest";
import {
  fireConfidence,
  fireLevel,
  hasSightingNear,
  singleCandidateLinks,
  type FireContext,
} from "@/lib/fire-confidence";

const bare: FireContext = {
  forestFraction: 0,
  dangerLevel: 1,
  nearbySighting: false,
  officialMention: false,
};

describe("fireLevel", () => {
  it("keeps a single look a heat signal whatever the context", () => {
    expect(
      fireLevel("candidate", {
        forestFraction: 0.9,
        dangerLevel: 5,
        nearbySighting: true,
        officialMention: true,
      }),
    ).toBe("heat_signal");
  });

  it("keeps two looks without context a heat signal", () => {
    expect(fireLevel("detected", bare)).toBe("heat_signal");
    expect(
      fireLevel("detected", {
        forestFraction: null,
        dangerLevel: null,
        nearbySighting: false,
        officialMention: false,
      }),
    ).toBe("heat_signal");
  });

  it.each([
    [{ forestFraction: 0.1 }, "probable"],
    [{ forestFraction: 0.099 }, "heat_signal"],
    [{ dangerLevel: 5 }, "probable"],
    [{ dangerLevel: 4 }, "heat_signal"],
    [{ nearbySighting: true }, "probable"],
    [{ officialMention: true }, "probable"],
  ] as const)("%o makes two looks %s", (over, level) => {
    expect(fireLevel("detected", { ...bare, ...over })).toBe(level);
  });

  it("keeps an official confirmation without any context", () => {
    expect(fireLevel("confirmed", bare)).toBe("confirmed");
  });
});

describe("hasSightingNear", () => {
  const fire = {
    lat: 36.7,
    lon: 4.0,
    first_detected_at: "2026-09-22T02:00:00Z",
    last_detected_at: "2026-09-22T12:00:00Z",
  };
  const report = (over: Record<string, unknown> = {}) => ({
    kind: "sighting" as const,
    lat: 36.72,
    lon: 4.01,
    observed_at: "2026-09-22T09:00:00Z",
    status: "pending" as const,
    ...over,
  });

  it("counts a citizen sighting within 5 km at any point of the fire's life", () => {
    expect(hasSightingNear(fire, [report()])).toBe(true);
    expect(
      hasSightingNear(fire, [report({ observed_at: "2026-09-22T12:30:00Z" })]),
    ).toBe(true);
    expect(
      hasSightingNear(fire, [report({ observed_at: "2026-09-21T21:00:00Z" })]),
    ).toBe(true);
  });

  it.each([
    ["too far", { lat: 36.8 }],
    ["from before the fire", { observed_at: "2026-09-21T19:59:00Z" }],
    ["long after its last look", { observed_at: "2026-09-22T18:01:00Z" }],
    ["rejected", { status: "rejected" }],
    ["not a fire report", { kind: "road_blocked" }],
  ])("ignores a report %s", (_label, over) => {
    expect(hasSightingNear(fire, [report(over)])).toBe(false);
  });
});

it("maps each level onto the shared ladder", () => {
  expect(
    (["heat_signal", "probable", "confirmed"] as const).map(fireConfidence),
  ).toEqual(["single", "corroborated", "official"]);
});

describe("singleCandidateLinks", () => {
  const reported = "2026-09-22T19:00:00Z";
  const incident = (over: Record<string, unknown> = {}) => ({
    wilaya_id: "w02",
    commune_id: null,
    authority_tier: "national",
    first_reported_at: reported,
    ...over,
  });
  const fire = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    wilaya_id: "w02",
    state: "active",
    confirmed_at: null,
    last_detected_at: "2026-09-22T16:07:00Z",
    ...over,
  });
  const links = (
    incidents: ReturnType<typeof incident>[],
    fires: ReturnType<typeof fire>[],
  ) => [...singleCandidateLinks(incidents, fires)].sort();

  it("links the only satellite fire of the wilaya around the report", () => {
    expect(links([incident()], [fire("boukadir")])).toEqual(["boukadir"]);
  });

  it("links nothing when several fires could match", () => {
    expect(links([incident()], [fire("a"), fire("b")])).toEqual([]);
  });

  it.each([
    ["located to a commune", { commune_id: "c1" }],
    ["from the media", { authority_tier: "media" }],
    ["in another wilaya", { wilaya_id: "w44" }],
  ])("ignores an incident %s", (_label, over) => {
    expect(links([incident(over)], [fire("a")])).toEqual([]);
  });

  it("never counts confirmed or false-positive fires as candidates", () => {
    expect(
      links(
        [incident()],
        [
          fire("a"),
          fire("done", { confirmed_at: reported }),
          fire("flare", { state: "false_positive" }),
        ],
      ),
    ).toEqual(["a"]);
  });

  it.each([
    ["2026-09-21T19:00:00Z", ["edge"]],
    ["2026-09-21T18:59:00Z", []],
    ["2026-09-23T01:00:00Z", ["edge"]],
    ["2026-09-23T01:01:00Z", []],
  ])("a last look at %s links %j", (seen, expected) => {
    expect(
      links([incident()], [fire("edge", { last_detected_at: seen })]),
    ).toEqual(expected);
  });
});
