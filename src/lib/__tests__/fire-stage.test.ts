import { describe, expect, it } from "vitest";

import { fireStage } from "@/lib/nadhir";

describe("fireStage", () => {
  it("is a candidate on one look, detected on two, confirmed only by an authority", () => {
    expect(fireStage({ state: "unconfirmed", confirmed_at: null })).toBe(
      "candidate",
    );
    expect(fireStage({ state: "active", confirmed_at: null })).toBe("detected");
    expect(fireStage({ state: "contained_guess", confirmed_at: null })).toBe(
      "detected",
    );
    expect(
      fireStage({ state: "active", confirmed_at: "2026-09-02T07:00:00Z" }),
    ).toBe("confirmed");
    expect(
      fireStage({ state: "unconfirmed", confirmed_at: "2026-09-02T07:00:00Z" }),
    ).toBe("confirmed");
  });
});
