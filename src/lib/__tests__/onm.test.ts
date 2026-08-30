import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  matchWilaya,
  normalizeName,
  parseCapDetail,
  parseOnmFeed,
} from "@/lib/ingest/onm.server";

const xml = readFileSync(
  join(__dirname, "fixtures", "onm-atom-sample.xml"),
  "utf8",
);

describe("parseOnmFeed", () => {
  it("parses live Atom entries with their CAP summary", () => {
    const entries = parseOnmFeed(xml);
    expect(entries).toHaveLength(4);
    const e = entries[0]!;
    expect(e.cap_id).toBe("urn:oid:2.49.0.1.12.0.2026.8.30.15.54.22.25497");
    expect(e.title).toBe(
      "Rain Moderate warning for the wilaya: SIDI-BEL-ABBÈS",
    );
    expect(e.event).toBe("Rain");
    expect(e.severity).toBe("Moderate");
    expect(e.urgency).toBe("Immediate");
    expect(e.certainty).toBe("Observed");
    expect(e.area_desc).toBe("SIDI-BEL-ABBÈS");
    expect(e.onset).toBe("2026-08-30T18:00:00Z");
    expect(e.expires).toBe("2026-08-31T00:00:00Z");
    expect(e.sent).toBe("2026-08-30T15:54:22Z");
    expect(e.cap_url).toBe(
      "https://ametvigilance.meteo.dz/CAPs/2026.8.30.15.54.22.25497.xml",
    );
  });

  it("returns nothing for a non-feed body", () => {
    expect(parseOnmFeed("<html>maintenance</html>")).toEqual([]);
  });
});

describe("matchWilaya", () => {
  const wilayas = [
    { id: "a", name_fr: "Sidi Bel Abbès" },
    { id: "b", name_fr: "Souk Ahras" },
    { id: "c", name_fr: "Alger" },
  ];

  it("matches ONM's dashed uppercase names to admin_units", () => {
    expect(matchWilaya("SIDI-BEL-ABBÈS", wilayas)?.id).toBe("a");
    expect(matchWilaya("SOUK-AHRAS", wilayas)?.id).toBe("b");
  });

  it("returns null rather than guessing on an unknown name", () => {
    expect(matchWilaya("WILAYA-INCONNUE", wilayas)).toBeNull();
  });

  it("normalizes diacritics and separators identically", () => {
    expect(normalizeName("SIDI-BEL-ABBÈS")).toBe(
      normalizeName("Sidi Bel Abbès"),
    );
  });

  it("matches ONM's MSILA to the apostrophed M'Sila", () => {
    expect(matchWilaya("MSILA", [{ id: "m", name_fr: "M'Sila" }])?.id).toBe(
      "m",
    );
  });
});

describe("parseCapDetail", () => {
  const capXml = readFileSync(
    join(__dirname, "fixtures", "onm-cap-sample.xml"),
    "utf8",
  );

  it("extracts the French headline and the area polygon", () => {
    const d = parseCapDetail(capXml)!;
    expect(d.headline_fr).toBe(
      "Avertissement de PLUIE Modéré pour la wilaya : SIDI-BEL-ABBÈS",
    );
    expect(d.polygon!.length).toBeGreaterThan(50);
    expect(d.polygon![0]).toEqual([-1.00398, 35.090229]);
  });

  it("drops the boilerplate no-information instruction", () => {
    expect(parseCapDetail(capXml)!.instruction_fr).toBeNull();
  });

  it("returns null for a non-CAP body", () => {
    expect(parseCapDetail("<html>404</html>")).toBeNull();
  });
});
