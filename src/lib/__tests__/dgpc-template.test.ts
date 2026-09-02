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
    expect(b.wilayaCounts[0]).toEqual({ wilaya: "سكيكدة", count: 5 });
    expect(b.wilayaCounts.at(-1)).toEqual({ wilaya: "البويرة", count: 1 });
  });

  it("extracts commune lists under a wilaya header, with counts and status", () => {
    const b = parseDgpcBulletin(
      fixture("bulletin-6857-1300.txt"),
      "2026-08-28T13:16:02Z",
    );
    const skikda = b.lines.find((l) => l.wilaya === "سكيكدة")!;
    expect(skikda.communes).toEqual(["عزابة", "عين زويت", "السبت", "أم الطوب"]);
    expect(skikda.status).toBe("ongoing");
    expect(skikda.count).toBe(5);
    const tebessa = b.lines.find((l) => l.wilaya === "تبسة")!;
    expect(tebessa.communes).toEqual(["الحمامات"]);
    expect(tebessa.count).toBe(1);
  });

  it("handles the inline and commune-first sentence forms", () => {
    const b = parseDgpcBulletin(
      fixture("bulletin-6808-2000.txt"),
      "2026-08-26T21:11:07Z",
    );
    const tizi = b.lines.find((l) => l.wilaya === "تيزي وزو")!;
    expect(tizi.communes).toContain("تيزي غنيف");
    expect(tizi.communes).toContain("مزرانة");
    const setif = b.lines.find((l) => l.wilaya === "سطيف")!;
    expect(setif.communes).toEqual(["تيزي نبشار"]);
    const tissemsilt = b.lines.find((l) => l.wilaya === "تيسمسيلت")!;
    expect(tissemsilt.communes).toEqual(["الأربعاء"]);
  });

  it("strips parenthesised localities and keeps the commune", () => {
    const b = parseDgpcBulletin(
      fixture("bulletin-6823.txt"),
      "2026-08-27T13:05:36Z",
    );
    const jijel = b.lines.find((l) => l.wilaya === "جيجل")!;
    expect(jijel.communes.slice(0, 3)).toEqual([
      "الشقفة",
      "تكسانة",
      "زيامة منصورية",
    ]);
    expect(b.asOf).toBe("2026-08-27T12:00:00.000Z");
  });

  it("reads extinguished status and a 24-hour bulletin's as-of", () => {
    const b = parseDgpcBulletin(
      fixture("bulletin-6908-0700.txt"),
      "2026-09-01T06:49:20Z",
    );
    expect(b.asOf).toBe("2026-09-01T06:00:00.000Z");
    const setif = b.lines.find((l) => l.wilaya === "سطيف")!;
    expect(setif.communes).toEqual(["تالة إيفاسن"]);
    expect(setif.status).toBe("extinguished");
    expect(setif.place).toBe("أولاد دلادج");
  });

  it("treats a bulletin line with no status verb as ongoing", () => {
    const text = `🔴 الحالة العامة لحرائق الغطاء النباتي ليوم 27 أوت 2026 على الساعة 13سا00د
🔴 أهم الحرائق
✅⏮️ حرائق ولاية #تيزي_وزو اندلاع 02 حرائق ببلديات إجر (01)، بونوح (01)`;
    const b = parseDgpcBulletin(text, "2026-08-27T13:05:36Z");
    expect(b.lines[0]!.status).toBe("ongoing");
  });

  it("keeps unknown for a standalone incident post with no status", () => {
    const text =
      "حريق غابة ببلدية تاكسنة بالمكان المسمى مشتة الميسة تم اجلاء بعض العائلات";
    const b = parseDgpcBulletin(text, "2026-08-29T10:00:00Z");
    expect(b.kind).toBe("incident");
    expect(b.lines[0]!.status).toBe("unknown");
  });
});
