import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  rows: {} as Record<string, unknown>,
  errors: {} as Record<string, string>,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const query: Record<string, unknown> = {};
      for (const op of [
        "select",
        "eq",
        "neq",
        "is",
        "in",
        "gte",
        "lte",
        "order",
        "range",
      ])
        query[op] = () => query;
      const result = () =>
        db.errors[table]
          ? { data: null, error: { message: db.errors[table] } }
          : { data: db.rows[table] ?? [], error: null };
      query["maybeSingle"] = async () => result();
      query["then"] = (resolve: (value: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve);
      return query;
    },
  },
}));
vi.mock("@/lib/ingest/algiers-date", () => ({
  algiersToday: () => "2026-09-22",
}));
import { fireContexts } from "@/lib/ingest/fire-context.server";

const cluster = {
  id: "f1",
  commune_id: "c1",
  lat: 36.7,
  lon: 4.0,
  first_detected_at: "2026-09-22T10:00:00Z",
  last_detected_at: "2026-09-22T12:00:00Z",
};

beforeEach(() => {
  db.errors = {};
  db.rows = {
    admin_units: [{ id: "c1", forest_fraction: 0.3 }],
    risk_publication_checkpoint: {
      coverage_status: "complete",
      snapshot_id: "s1",
      base_date: "2026-09-22",
      published_at: "2026-09-22T04:00:00Z",
    },
    risk_forecasts: [{ commune_id: "c1", danger_level: 5 }],
    hazard_reports: [
      {
        kind: "sighting",
        lat: 36.71,
        lon: 4.0,
        observed_at: "2026-09-22T11:00:00Z",
        status: "pending",
      },
    ],
  };
});

it("gathers forest cover, today's danger and nearby sightings per fire", async () => {
  expect((await fireContexts([cluster])).get("f1")).toEqual({
    forestFraction: 0.3,
    dangerLevel: 5,
    nearbySighting: true,
    officialMention: false,
  });
});

it("backs the only satellite fire of a wilaya named by the DGPC", async () => {
  db.rows["official_incidents"] = [
    {
      wilaya_id: "w1",
      commune_id: null,
      authority_tier: "national",
      first_reported_at: "2026-09-22T15:00:00Z",
    },
  ];
  db.rows["fire_clusters"] = [
    {
      id: "f1",
      wilaya_id: "w1",
      state: "active",
      confirmed_at: null,
      last_detected_at: "2026-09-22T12:00:00Z",
    },
  ];
  expect((await fireContexts([cluster])).get("f1")?.officialMention).toBe(true);
  db.rows["fire_clusters"] = [
    ...(db.rows["fire_clusters"] as object[]),
    {
      id: "f2",
      wilaya_id: "w1",
      state: "active",
      confirmed_at: null,
      last_detected_at: "2026-09-22T13:00:00Z",
    },
  ];
  expect((await fireContexts([cluster])).get("f1")?.officialMention).toBe(
    false,
  );
});

it("leaves danger unknown when no forecast is published for today", async () => {
  db.rows["risk_publication_checkpoint"] = null;
  expect((await fireContexts([cluster])).get("f1")?.dangerLevel).toBeNull();
});

it.each([
  "admin_units",
  "risk_publication_checkpoint",
  "risk_forecasts",
  "hazard_reports",
  "official_incidents",
])("fails loudly when %s cannot be read", async (table) => {
  db.errors[table] = "unavailable";
  await expect(fireContexts([cluster])).rejects.toThrow("unavailable");
});

it("skips every query for an empty list", async () => {
  db.errors = { admin_units: "must not be read" };
  expect((await fireContexts([])).size).toBe(0);
});
