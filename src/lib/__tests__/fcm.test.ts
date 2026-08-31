import { describe, expect, it } from "vitest";

import { FCM_LANGS, fcmMessagesForFire, fcmMessagesForOnm, fcmTopic } from "@/lib/fcm";

const info = [
  { language: "ar-DZ", headline: "حريق مؤكد — عزازقة", description: "وصف عربي" },
  { language: "fr-DZ", headline: "Incendie confirmé — Azazga", description: "desc fr" },
  { language: "en", headline: "Confirmed fire — Azazga", description: "desc en" },
  { language: "kab", headline: "Times — Azazga", description: "desc kab" },
];

describe("fcmTopic", () => {
  it("names topics per ADR-0004", () => {
    expect(fcmTopic("1503", "ar")).toBe("v1.commune.1503.ar");
  });
});

describe("fcmMessagesForFire", () => {
  const messages = fcmMessagesForFire({
    broadcastId: "b-1",
    severity: "Severe",
    communeCodes: ["1503", "1510"],
    shortId: "DZ7K4A",
    info,
  });

  it("fans out one message per commune and language", () => {
    expect(messages).toHaveLength(2 * FCM_LANGS.length);
    expect(messages.map((m) => m.topic)).toContain("v1.commune.1510.kab");
  });

  it("takes title and body from the CAP info block of the topic language", () => {
    const fr = messages.find((m) => m.topic === "v1.commune.1503.fr")!;
    expect(fr.notification.title).toBe("Incendie confirmé — Azazga");
    expect(fr.notification.body).toBe("desc fr");
    const ar = messages.find((m) => m.topic === "v1.commune.1503.ar")!;
    expect(ar.notification.title).toBe("حريق مؤكد — عزازقة");
  });

  it("deep-links to the fire page", () => {
    expect(messages[0]!.webpush.fcm_options.link).toBe(
      "https://nadhir.app/fire/DZ7K4A",
    );
    expect(messages[0]!.data).toEqual({
      broadcast_id: "b-1",
      severity: "Severe",
      kind: "fire",
    });
  });

  it("drops a language with no info block rather than inventing text", () => {
    const partial = fcmMessagesForFire({
      broadcastId: "b-1",
      severity: "Severe",
      communeCodes: ["1503"],
      shortId: "DZ7K4A",
      info: info.slice(0, 2),
    });
    expect(partial).toHaveLength(2);
    expect(partial.every((m) => m.notification.title)).toBe(true);
  });
});

describe("fcmMessagesForOnm", () => {
  const messages = fcmMessagesForOnm({
    broadcastId: "b-2",
    severity: "Extreme",
    communeCodes: ["1503"],
    title: "Rain Extreme warning for the wilaya: Tizi Ouzou",
    headlineFr: "Pluies torrentielles attendues",
    sent: "2026-08-30T10:00:00Z",
  });

  it("relays verbatim with attribution to every language topic", () => {
    expect(messages).toHaveLength(FCM_LANGS.length);
    for (const m of messages) {
      expect(m.notification.title).toContain("ONM");
      expect(m.notification.body).toBe("Pluies torrentielles attendues");
      expect(m.data.kind).toBe("onm");
    }
  });

  it("falls back to the feed title when no French headline exists", () => {
    const bare = fcmMessagesForOnm({
      broadcastId: "b-2",
      severity: "Severe",
      communeCodes: ["1503"],
      title: "Wind Severe warning for the wilaya: Bejaia",
      headlineFr: null,
      sent: "2026-08-30T10:00:00Z",
    });
    expect(bare[0]!.notification.body).toBe(
      "Wind Severe warning for the wilaya: Bejaia",
    );
  });

  it("links to the forecast surface", () => {
    expect(messages[0]!.webpush.fcm_options.link).toBe(
      "https://nadhir.app/forecast",
    );
  });
});
