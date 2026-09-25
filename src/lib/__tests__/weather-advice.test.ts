import { describe, expect, it } from "vitest";

import { adviceFor, type WeatherAdvice } from "@/lib/weather-advice";

const advice = (over: Partial<WeatherAdvice>): WeatherAdvice => ({
  id: "a1",
  advice: "يُرجى توخي الحيطة والحذر أثناء السياقة",
  wilaya_ids: ["w31"],
  valid_from: "2026-09-20T11:00:00Z",
  valid_to: "2026-09-20T20:00:00Z",
  created_at: "2026-09-19T15:41:00Z",
  ...over,
});
const warning = {
  wilaya_id: "w31",
  onset: "2026-09-20T12:00:00Z",
  expires: "2026-09-20T21:00:00Z",
  sent: "2026-09-19T15:00:00Z",
};

describe("adviceFor", () => {
  it("attaches the newest advice naming the wilaya for an overlapping period", () => {
    const older = advice({ id: "old", created_at: "2026-09-19T10:00:00Z" });
    expect(adviceFor(warning, [older, advice({})])?.id).toBe("a1");
  });

  it("ignores advice for another wilaya or another period", () => {
    expect(adviceFor(warning, [advice({ wilaya_ids: ["w16"] })])).toBeNull();
    expect(
      adviceFor(warning, [
        advice({
          valid_from: "2026-09-22T06:00:00Z",
          valid_to: "2026-09-22T20:00:00Z",
        }),
      ]),
    ).toBeNull();
  });

  it("reads undated advice as covering the day it was posted", () => {
    expect(
      adviceFor(warning, [
        advice({
          valid_from: null,
          valid_to: null,
          created_at: "2026-09-20T09:00:00Z",
        }),
      ])?.id,
    ).toBe("a1");
  });
});
