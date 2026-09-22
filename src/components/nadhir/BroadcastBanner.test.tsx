import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { BroadcastBanner } from "./BroadcastBanner";

const rows = vi.hoisted(() => ({ data: [] as unknown[] }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "fr" } }),
}));
vi.mock("@tanstack/react-router", () => ({ Link: () => null }));
vi.mock("@/lib/push", () => ({
  readSubscription: () => ({ communes: ["1503"] }),
}));
vi.mock("@tanstack/react-query", () => ({
  queryOptions: (options: unknown) => options,
  useQuery: () => ({ data: rows.data }),
}));

const hoursAgo = (h: number) =>
  new Date(Date.now() - h * 3_600_000).toISOString();
const fireRow = (id: string, lastSeenHours: number) => ({
  id,
  kind: "fire",
  phase: "initial",
  severity: "Severe",
  commune_codes: ["1503"],
  cluster_id: id,
  created_at: hoursAgo(10),
  cap_alerts: { info: [{ language: "fr", headline: `Feu ${id}` }] },
  fire_clusters: {
    short_id: id,
    state: "active",
    last_detected_at: hoursAgo(lastSeenHours),
    resolved_at: null,
  },
  onm_vigilance: null,
  authority_warnings: null,
});

beforeEach(() => {
  rows.data = [];
});

it("keeps announcing a fire only while it is live", () => {
  rows.data = [fireRow("LIVE1", 1), fireRow("QUIET", 9)];
  const html = renderToStaticMarkup(<BroadcastBanner />);
  expect(html).toContain("Feu LIVE1");
  expect(html).not.toContain("Feu QUIET");
});

it("drops an ONM relay once the warning's own validity ended", () => {
  rows.data = [
    {
      ...fireRow("x", 1),
      id: "onm",
      kind: "onm",
      cluster_id: null,
      fire_clusters: null,
      onm_vigilance: {
        title: "Pluie",
        headline_fr: "Pluies",
        expires: hoursAgo(1),
      },
    },
  ];
  expect(renderToStaticMarkup(<BroadcastBanner />)).toBe("");
});
