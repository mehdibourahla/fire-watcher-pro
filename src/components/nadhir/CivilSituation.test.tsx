import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Situation } from "@/lib/civil-map";
import type { FireCluster, OfficialIncident } from "@/lib/nadhir";
import type { Phase } from "@/lib/incident-lifecycle";
import { SituationCard } from "./CivilSituation";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: { status?: string }) =>
      vars?.status ? `${key}(${vars.status})` : key,
    i18n: { language: "fr" },
  }),
}));
vi.mock("@tanstack/react-router", () => ({ Link: () => null }));

const now = Date.parse("2026-09-22T12:00:00Z");
const base = {
  category: "fire" as const,
  at: "2026-09-21T06:00:00Z",
  lat: 36.7,
  lon: 4.0,
  areaId: null,
  wilayaId: null,
  candidate: false,
};
const card = (item: Situation) =>
  renderToStaticMarkup(
    <SituationCard
      item={item}
      units={[]}
      now={now}
      selected={false}
      onSelect={() => {}}
    />,
  );
const satellite = (phase: Phase): Situation => ({
  ...base,
  id: "fire:f",
  source: "satellite",
  phase,
  data: { state: "extinguished" } as FireCluster,
});
const official = (phase: Phase, status: string): Situation => ({
  ...base,
  id: "official:i",
  source: "official",
  phase,
  data: {
    status,
    authority_tier: "national",
    commune: null,
    wilaya: {
      name_ar: "بجاية",
      name_fr: "Béjaïa",
      name_en: "Bejaia",
      name_kab: null,
    },
  } as unknown as OfficialIncident,
});

describe("situation status wording", () => {
  it("says no new detections for a fire the satellite stopped seeing, never ended", () => {
    const html = card(satellite("archived"));
    expect(html).toContain("civilMap.archived");
    expect(html).not.toContain("civilMap.ended");
  });

  it("says not seen recently while a fire fades", () => {
    expect(card(satellite("fading"))).toContain("civilMap.quiet");
  });

  it("keeps ended for an operator's closure", () => {
    expect(card(satellite("ended"))).toContain("civilMap.ended");
  });

  it("presents an old authority status as the last one known", () => {
    expect(card(official("fading", "ongoing"))).toContain(
      "civilMap.lastKnown(official.statuses.ongoing)",
    );
    expect(card(official("live", "ongoing"))).toContain(
      "official.statuses.ongoing",
    );
    expect(card(official("live", "ongoing"))).not.toContain(
      "civilMap.lastKnown",
    );
  });
});
