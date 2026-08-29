import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildFireCap, capToXml } from "@/lib/cap";

const input = {
  shortId: "DZVVQPN",
  lat: 36.5553,
  lon: 5.4707,
  radiusKm: 5,
  confidence: 0.83,
  urgent: false,
  areaDesc: "Béjaïa",
  sentAt: new Date("2026-08-28T12:00:00Z"),
  texts: [
    {
      language: "fr-DZ",
      event: "Feu de forêt",
      headline: "Incendie près de Béjaïa",
      description: "Incendie à 4,2 km de Béjaïa.",
      instruction: "Appelez la Protection Civile au 14.",
    },
    {
      language: "ar-DZ",
      event: "حريق غابات",
      headline: "حريق قرب بجاية",
      description: "حريق على بعد 4.2 كم من بجاية.",
      instruction: "اتصل بالحماية المدنية على 14.",
    },
  ],
};

describe("buildFireCap", () => {
  it("is a public, actual alert with a stable identifier per fire and tier", () => {
    const cap = buildFireCap(input);
    expect(cap.status).toBe("Actual");
    expect(cap.msgType).toBe("Alert");
    expect(cap.scope).toBe("Public");
    expect(cap.identifier).toBe("nadhir-fire-DZVVQPN-new");
    expect(buildFireCap({ ...input, urgent: true }).identifier).toBe(
      "nadhir-fire-DZVVQPN-urgent",
    );
  });

  it("uses a numeric timezone offset, which CAP requires instead of Z", () => {
    const cap = buildFireCap(input);
    expect(cap.sent).toBe("2026-08-28T13:00:00+01:00");
    expect(cap.sent).not.toContain("Z");
  });

  it("raises urgency and severity for a settlement in the downwind cone", () => {
    expect(buildFireCap(input).info[0]!.urgency).toBe("Expected");
    expect(buildFireCap(input).info[0]!.severity).toBe("Severe");

    const urgent = buildFireCap({ ...input, urgent: true });
    expect(urgent.info[0]!.urgency).toBe("Immediate");
    expect(urgent.info[0]!.severity).toBe("Extreme");
  });

  it("reports certainty from how strongly the fire was detected", () => {
    expect(
      buildFireCap({ ...input, confidence: 0.83 }).info[0]!.certainty,
    ).toBe("Observed");
    expect(
      buildFireCap({ ...input, confidence: 0.62 }).info[0]!.certainty,
    ).toBe("Likely");
  });

  it("carries one info block per language, each with its own text", () => {
    const cap = buildFireCap(input);
    expect(cap.info.map((i) => i.language)).toEqual(["fr-DZ", "ar-DZ"]);
    expect(cap.info[1]!.headline).toBe("حريق قرب بجاية");
    expect(cap.info[1]!.instruction).toBe("اتصل بالحماية المدنية على 14.");
  });

  it("describes the affected area as a CAP circle in kilometres", () => {
    expect(buildFireCap(input).info[0]!.circle).toBe("36.5553,5.4707 5");
  });

  it("expires, so a stale warning cannot be replayed as current", () => {
    const cap = buildFireCap(input);
    expect(Date.parse(cap.info[0]!.expires)).toBeGreaterThan(
      Date.parse(cap.info[0]!.effective),
    );
  });
});

describe("cap_alerts CHECK constraints", () => {
  const sql = readFileSync(
    "supabase/migrations/20260829010000_2c5f7a48-9e31-4b06-8d72-6a1e4f9c3b57.sql",
    "utf8",
  );
  const allowed = (column: string) =>
    (
      new RegExp(
        `${column} text NOT NULL CHECK \\(${column} IN \\(([^)]*)\\)\\)`,
      ).exec(sql)?.[1] ?? ""
    )
      .split(",")
      .map((s) => s.trim().replace(/'/g, ""));

  it("accept the values buildFireCap emits", () => {
    const cap = buildFireCap(input);
    expect(allowed("status")).toContain(cap.status);
    expect(allowed("msg_type")).toContain(cap.msgType);
    expect(allowed("scope")).toContain(cap.scope);
  });
});

describe("capToXml", () => {
  it("emits a CAP 1.2 document with one info element per language", () => {
    const xml = capToXml(buildFireCap(input));
    expect(xml).toContain('xmlns="urn:oasis:names:tc:emergency:cap:1.2"');
    expect(xml.match(/<info>/g)).toHaveLength(2);
    expect(xml).toContain("<identifier>nadhir-fire-DZVVQPN-new</identifier>");
    expect(xml).toContain("<circle>36.5553,5.4707 5</circle>");
  });

  it("escapes text so a place name cannot break the document", () => {
    const xml = capToXml(
      buildFireCap({
        ...input,
        texts: [
          {
            ...input.texts[0]!,
            headline: 'Fire <near> "Béjaïa" & Sétif',
          },
        ],
      }),
    );
    expect(xml).toContain("&lt;near&gt; &quot;Béjaïa&quot; &amp; Sétif");
    expect(xml).not.toContain("<near>");
  });
});
