import { describe, expect, it } from "vitest";

import {
  telegramFireHtml,
  telegramOnmHtml,
  telegramSeverityAllowed,
} from "@/lib/telegram";

describe("telegramSeverityAllowed", () => {
  it("floors at Severe", () => {
    expect(telegramSeverityAllowed("Extreme")).toBe(true);
    expect(telegramSeverityAllowed("Severe")).toBe(true);
    expect(telegramSeverityAllowed("Moderate")).toBe(false);
  });
});

describe("telegramFireHtml", () => {
  const html = telegramFireHtml({
    headline: "Incendie confirmé — Azazga <test> & Fréha",
    description: "Un incendie brûle près d'Azazga.",
    shortId: "DZ7K4A",
    severity: "Extreme",
  });

  it("escapes CAP text so a place name cannot inject markup", () => {
    expect(html).toContain("&lt;test&gt; &amp; Fréha");
    expect(html).not.toContain("<test>");
  });

  it("links to the fire page and keeps the short id visible", () => {
    expect(html).toContain("https://nadhir.app/fire/DZ7K4A");
    expect(html).toContain("DZ7K4A");
  });

  it("renders headline bold with the description below", () => {
    expect(html).toMatch(/<b>.*Azazga.*<\/b>/);
    expect(html).toContain("Un incendie brûle près d'Azazga.");
  });
});

describe("telegramOnmHtml", () => {
  const html = telegramOnmHtml({
    title: "Rain Extreme warning for the wilaya: Tizi Ouzou",
    headlineFr: "Pluies <fortes> attendues",
    severity: "Extreme",
  });

  it("relays verbatim, escaped, with ONM attribution", () => {
    expect(html).toContain("ONM");
    expect(html).toContain("Pluies &lt;fortes&gt; attendues");
  });

  it("falls back to the feed title when no French headline exists", () => {
    expect(
      telegramOnmHtml({
        title: "Wind Severe warning",
        headlineFr: null,
        severity: "Severe",
      }),
    ).toContain("Wind Severe warning");
  });
});

describe("telegramAuthorityHtml", () => {
  it("attributes the named authority and escapes the body", async () => {
    const { telegramAuthorityHtml } = await import("@/lib/telegram");
    const html = telegramAuthorityHtml({
      source: "Protection Civile <Wilaya>",
      body: "Consigne & détail",
    });
    expect(html).toContain("Protection Civile &lt;Wilaya&gt;");
    expect(html).toContain("Consigne &amp; détail");
  });
});
