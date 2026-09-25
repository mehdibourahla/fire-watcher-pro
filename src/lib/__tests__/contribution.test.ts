import { describe, expect, it } from "vitest";

import { badgesFor, levelFor, nextBadge } from "@/lib/contribution";

const none = {
  published: 0,
  corroborated: 0,
  confirmations: 0,
  hazards: 0,
  alerted: 0,
  witnesses: 0,
  points: 0,
};

describe("levelFor", () => {
  it("places points on the level ladder with the distance to the next rung", () => {
    expect(levelFor(0)).toEqual({
      current: "observer",
      next: "witness",
      toNext: 30,
      progress: 0,
    });
    expect(levelFor(45)).toMatchObject({
      current: "witness",
      next: "guardian",
      toNext: 55,
    });
    expect(levelFor(45).progress).toBeCloseTo(15 / 70);
    expect(levelFor(500)).toEqual({
      current: "sentinel",
      next: null,
      toNext: 0,
      progress: 1,
    });
  });
});

describe("badges", () => {
  it("earns a badge only from confirmed activity", () => {
    const earned = badgesFor({ ...none, published: 9 }).filter((b) => b.earned);
    expect(earned).toEqual([]);
    expect(badgesFor({ ...none, corroborated: 1 })[0]).toMatchObject({
      key: "firstCorroborated",
      earned: true,
    });
  });

  it("nudges toward the badge closest to done", () => {
    expect(nextBadge({ ...none, confirmations: 4, hazards: 1 })).toMatchObject({
      key: "fiveConfirmations",
      have: 4,
      need: 5,
    });
    expect(
      nextBadge({
        ...none,
        corroborated: 1,
        confirmations: 5,
        hazards: 3,
        alerted: 2,
      }),
    ).toBeNull();
  });
});
