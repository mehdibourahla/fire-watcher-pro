import { describe, expect, it } from "vitest";

import { relativeTime } from "@/lib/nadhir";

describe("relativeTime", () => {
  it("uses the supplied render time across a minute boundary", () => {
    const observedAt = "2026-08-31T12:00:00.000Z";

    expect(
      relativeTime(observedAt, "en", Date.parse("2026-08-31T12:28:29.000Z")),
    ).toBe("28 minutes ago");
    expect(
      relativeTime(observedAt, "en", Date.parse("2026-08-31T12:28:31.000Z")),
    ).toBe("29 minutes ago");
  });
});
