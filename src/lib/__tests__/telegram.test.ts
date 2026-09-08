import { describe, expect, it } from "vitest";

import { telegramSeverityAllowed } from "@/lib/telegram";

describe("telegramSeverityAllowed", () => {
  it("floors at Severe", () => {
    expect(telegramSeverityAllowed("Extreme")).toBe(true);
    expect(telegramSeverityAllowed("Severe")).toBe(true);
    expect(telegramSeverityAllowed("Moderate")).toBe(false);
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
