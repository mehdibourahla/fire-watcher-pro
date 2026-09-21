import { describe, expect, it } from "vitest";
import { buildCivilPublicationCap, capToXml } from "@/lib/cap";

const publication = {
  id: "a-publication",
  hazard: "road" as const,
  summary: "Route <fermée>",
  source_name: "Info Trafic Algérie",
  source_url: "https://infotraficalgerie.com/home",
  source_published_at: "2026-09-16T08:00:00Z",
  published_at: "2026-09-16T09:00:00Z",
  updated_at: "2026-09-16T09:00:00Z",
  expires_at: "2026-09-16T12:00:00Z",
  state: "published" as const,
  revision: 1,
  cap_references: [],
};

describe("reviewed civil CAP", () => {
  it("preserves attribution without inventing emergency severity or point geometry", () => {
    const cap = buildCivilPublicationCap(publication, "Alger");
    expect(cap.info[0]).toMatchObject({
      category: "Transport",
      severity: "Unknown",
      urgency: "Unknown",
      certainty: "Unknown",
      areaDesc: "Alger",
      instruction: "",
    });
    expect(cap.info[0]!.description).toContain(publication.source_url);
    expect(cap.info[0]!.circle).toBeUndefined();
    expect(capToXml(cap)).toContain("Route &lt;fermée&gt;");
  });
  it.each([
    ["fire", "Fire"],
    ["weather", "Met"],
    ["flood", "Met"],
    ["other", "Other"],
  ] as const)("maps %s to %s", (hazard, category) => {
    expect(
      buildCivilPublicationCap({ ...publication, hazard }, "Alger").info[0]!
        .category,
    ).toBe(category);
  });
  it("chains revisions and withdraws without claiming that the incident ended", () => {
    const revised = {
      ...publication,
      revision: 3,
      updated_at: "2026-09-16T11:00:00Z",
      cap_references: [
        { revision: 1, sent: publication.published_at },
        { revision: 2, sent: "2026-09-16T10:00:00Z" },
      ],
    };
    expect(buildCivilPublicationCap(revised, "Alger").msgType).toBe("Update");
    const cancel = buildCivilPublicationCap(
      { ...revised, state: "withdrawn" },
      "Alger",
    );
    expect(cancel.msgType).toBe("Cancel");
    expect(cancel.references).toBe(
      "alerts@nadhir.app,nadhir-civil-a-publication-1,2026-09-16T10:00:00+01:00 alerts@nadhir.app,nadhir-civil-a-publication-2,2026-09-16T11:00:00+01:00",
    );
    expect(cancel.info).toEqual([]);
  });
});
