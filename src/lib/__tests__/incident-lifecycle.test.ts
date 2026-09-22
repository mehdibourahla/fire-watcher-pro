import { describe, expect, it } from "vitest";
import {
  civilLeaseHours,
  firePhase,
  isVisibleByDefault,
  officialPhase,
  publicationPhase,
  reportPhase,
  warningPhase,
} from "@/lib/incident-lifecycle";

const NOW = Date.parse("2026-09-22T12:00:00Z");
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();
const ahead = (hours: number) =>
  new Date(NOW + hours * 3_600_000).toISOString();

describe("firePhase", () => {
  const fire = (
    state: string,
    hours: number,
    resolved_at: string | null = null,
  ) => firePhase({ state, last_detected_at: ago(hours), resolved_at }, NOW);

  it.each([
    [5.9, "live"],
    [6, "fading"],
    [23.9, "fading"],
    [24, "archived"],
  ])("a fire last seen %s h ago is %s", (hours, phase) => {
    expect(fire("active", hours)).toBe(phase);
  });

  it("never ends a fire because the satellite went quiet", () => {
    expect(fire("extinguished", 30)).toBe("archived");
    expect(fire("contained_guess", 10)).toBe("fading");
  });

  it("ends a fire only when an operator closed it", () => {
    expect(fire("extinguished", 2, ago(1))).toBe("ended");
  });

  it("revives a fading fire as soon as a newer look arrives", () => {
    expect(fire("contained_guess", 0.5)).toBe("live");
  });

  it("archives a fire whose timestamp cannot be read", () => {
    expect(
      firePhase(
        { state: "active", last_detected_at: "nope", resolved_at: null },
        NOW,
      ),
    ).toBe("archived");
  });
});

describe("officialPhase", () => {
  const incident = (
    status: string,
    hours: number,
    unlisted_at: string | null = null,
  ) =>
    officialPhase({ status, last_reported_at: ago(hours), unlisted_at }, NOW);

  it.each([
    [23.9, "live"],
    [24, "fading"],
    [71.9, "fading"],
    [72, "archived"],
  ])("an incident last mentioned %s h ago is %s", (hours, phase) => {
    expect(incident("ongoing", hours)).toBe(phase);
  });

  it("ends only on the authority's own word", () => {
    expect(incident("extinguished", 1)).toBe("ended");
    expect(incident("contained", 1)).toBe("live");
  });

  it("fades an incident the bulletin stopped listing", () => {
    expect(incident("ongoing", 2, ago(1))).toBe("fading");
    expect(incident("ongoing", 80, ago(70))).toBe("archived");
  });
});

describe("reportPhase", () => {
  it.each([
    ["sighting", 2.9, "live"],
    ["sighting", 3, "fading"],
    ["road_blocked", 1.9, "live"],
    ["road_blocked", 2, "fading"],
    ["person_trapped", 2.9, "live"],
    ["sighting", 24, "archived"],
  ] as const)("a %s report %s h old is %s", (kind, hours, phase) => {
    expect(reportPhase({ kind, observed_at: ago(hours) }, NOW)).toBe(phase);
  });
});

describe("publicationPhase", () => {
  const publication = (
    state: "published" | "withdrawn",
    expires: string,
    sourceHours: number,
  ) =>
    publicationPhase(
      { state, expires_at: expires, source_published_at: ago(sourceHours) },
      NOW,
    );

  it("is live until its validity ends, then fades until three days after the source", () => {
    expect(publication("published", ahead(1), 1)).toBe("live");
    expect(publication("published", ago(0), 2)).toBe("fading");
    expect(publication("published", ago(10), 71.9)).toBe("fading");
    expect(publication("published", ago(10), 72)).toBe("archived");
  });

  it("archives a withdrawn publication", () => {
    expect(publication("withdrawn", ahead(1), 1)).toBe("archived");
  });
});

describe("warningPhase", () => {
  const warning = (
    onset: string | null,
    expires: string | null,
    superseded_at: string | null = null,
  ) => warningPhase({ onset, expires, superseded_at }, NOW);

  it("follows ONM's own validity", () => {
    expect(warning(ahead(3), ahead(9))).toBe("upcoming");
    expect(warning(ago(1), ahead(5))).toBe("live");
    expect(warning(null, ahead(5))).toBe("live");
    expect(warning(ago(9), ago(0))).toBe("ended");
  });

  it("archives a warning ONM replaced", () => {
    expect(warning(ago(1), ahead(5), ago(0.5))).toBe("archived");
  });

  it("treats a warning without an end as live, never as ended", () => {
    expect(warning(ago(1), null)).toBe("live");
  });
});

it("gives each civil hazard its own lease", () => {
  expect(
    (["road", "fire", "flood", "weather", "other"] as const).map(
      civilLeaseHours,
    ),
  ).toEqual([2, 3, 6, 6, 6]);
});

it("shows only upcoming and live situations by default", () => {
  expect(
    (["upcoming", "live", "fading", "archived", "ended"] as const).filter(
      isVisibleByDefault,
    ),
  ).toEqual(["upcoming", "live"]);
});
