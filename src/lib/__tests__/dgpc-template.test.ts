import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseDgpcBulletin } from "@/lib/text-sources/dgpc-template";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "fixtures", "dgpc", name), "utf8");

describe("parseDgpcBulletin", () => {
  it("classifies urban and weather-relay posts as not fire bulletins", () => {
    expect(
      parseDgpcBulletin(fixture("urban-6907.txt"), "2026-09-01T05:14:23Z").kind,
    ).toBe("urban");
    expect(
      parseDgpcBulletin(fixture("weather-6893.txt"), "2026-08-31T09:50:57Z")
        .kind,
    ).toBe("weather_relay");
  });

  it("reads the as-of hour as Algiers time on the posting day", () => {
    const b = parseDgpcBulletin(
      fixture("bulletin-6857-1300.txt"),
      "2026-08-28T13:16:02Z",
    );
    expect(b.kind).toBe("bulletin");
    expect(b.asOf).toBe("2026-08-28T12:00:00.000Z");
    expect(b.totals).toEqual({ total: 97, extinguished: 68, ongoing: 29 });
  });

  it("reads the per-wilaya ongoing counts", () => {
    const b = parseDgpcBulletin(
      fixture("bulletin-6857-1300.txt"),
      "2026-08-28T13:16:02Z",
    );
    expect(b.wilayaCounts).toHaveLength(15);
    expect(b.wilayaCounts[0]).toMatchObject({ wilaya: "سكيكدة", count: 5 });
    expect(b.wilayaCounts.at(-1)).toMatchObject({
      wilaya: "البويرة",
      count: 1,
    });
  });

  it("reads count lines with or without the arrow, a colon, a parenthetical, or a trailing comma", () => {
    const text = `🔴 الحالة العامة لحرائق الغطاء النباتي ليوم 01 سبتمبر 2026 على الساعة 13سا00د
🔴 العدد الإجمالي للحرائق: 10
🔴 عدد الحرائق التي تم إخمادها: 06
🔴 عدد الحرائق المتواصلة: 04
✅✅ الحرائق المتواصلة موزعة على:
⏮️⏮️ ولاية باتنة 01
ولاية #سكيكدة 01
⏮️⏮️ ولاية برج بوعريريج: 01 (حريق حزم تبن)
⏮️⏮️ ولاية سطيف 01،
🔴 أهم الحرائق
✅⏮️ حريق ببلدية عزابة، العملية متواصلة...`;
    const b = parseDgpcBulletin(text, "2026-09-01T13:04:39Z");
    expect(b.wilayaCounts).toEqual([
      { wilaya: "باتنة", count: 1, raw: "⏮️⏮️ ولاية باتنة 01" },
      { wilaya: "سكيكدة", count: 1, raw: "ولاية #سكيكدة 01" },
      {
        wilaya: "برج بوعريريج",
        count: 1,
        raw: "⏮️⏮️ ولاية برج بوعريريج: 01 (حريق حزم تبن)",
      },
      { wilaya: "سطيف", count: 1, raw: "⏮️⏮️ ولاية سطيف 01،" },
    ]);
  });

  it("reads the 24-hour summary form: totals and an inline per-wilaya distribution", () => {
    const b = parseDgpcBulletin(
      fixture("bulletin-6947-24h.txt"),
      "2026-09-03T08:46:00Z",
    );
    expect(b.kind).toBe("bulletin");
    expect(b.asOf).toBe("2026-09-03T06:00:00.000Z");
    expect(b.totals).toEqual({ total: 25, extinguished: 23, ongoing: 2 });
    expect(b.wilayaCounts).toEqual([
      {
        wilaya: "سطيف",
        count: 1,
        raw: "✅إجمالي الحرائق الجارية: 02 حريقين على مستوى ولايتي #سطيف (01) و #سوق_أهراس (01).",
      },
      {
        wilaya: "سوق أهراس",
        count: 1,
        raw: "✅إجمالي الحرائق الجارية: 02 حريقين على مستوى ولايتي #سطيف (01) و #سوق_أهراس (01).",
      },
    ]);
  });

  it("classifies a standalone incident post", () => {
    const b = parseDgpcBulletin(
      "حريق غابة ببلدية تاكسنة بالمكان المسمى مشتة الميسة تم اجلاء بعض العائلات",
      "2026-08-29T10:00:00Z",
    );
    expect(b.kind).toBe("incident");
    expect(b.totals).toBeNull();
    expect(b.wilayaCounts).toEqual([]);
  });

  it("reads a 24-hour bulletin's as-of", () => {
    const b = parseDgpcBulletin(
      fixture("bulletin-6908-0700.txt"),
      "2026-09-01T06:49:20Z",
    );
    expect(b.asOf).toBe("2026-09-01T06:00:00.000Z");
    expect(b.totals).toEqual({ total: 37, extinguished: 36, ongoing: 1 });
  });
});
