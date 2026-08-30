import { describe, expect, test } from "vitest";
import {
  formatTelegramAlertHtml,
  type TelegramAlertPayload,
} from "@/lib/telegram.server";

describe("Telegram Alert formatting", () => {
  test("formats emergency wildfire alert with civil protection instruction and link", () => {
    const alert: TelegramAlertPayload = {
      id: "alt-123",
      kind: "fire",
      severity: 5,
      title: "عاجل: حريق يقترب من عين الحمام",
      body: "حريق على بعد 3.2 كم من عين الحمام والرياح تدفعه نحو الشمال الشرقي.",
      distance_km: 3.2,
      payload: {
        short_id: "DZ98A",
        settlement: "قرية تاوريرت",
        confidence: 0.88,
      },
    };

    const text = formatTelegramAlertHtml(alert, "https://nadhir.app");

    expect(text).toContain("🚨 <b>نذير | تنبيه حريق عاجل");
    expect(text).toContain("عاجل: حريق يقترب من عين الحمام");
    expect(text).toContain("قرية تاوريرت");
    expect(text).toContain("3.2 كم");
    expect(text).toContain("88%");
    expect(text).toContain("14");
    expect(text).toContain("https://nadhir.app/#fire-DZ98A");
  });

  test("formats standard advisory when severity is lower than emergency", () => {
    const alert: TelegramAlertPayload = {
      id: "alt-456",
      kind: "fire",
      severity: 4,
      title: "حريق قرب تيزي راشد",
      body: "تم رصد حريق على بعد 7.5 كم من تيزي راشد.",
      distance_km: 7.5,
    };

    const text = formatTelegramAlertHtml(alert, "https://nadhir.app");
    expect(text).toContain("⚠️ <b>نذير | إشعار نشاط حريق");
  });
});
