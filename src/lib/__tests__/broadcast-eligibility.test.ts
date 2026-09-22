import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  rows: {} as Record<string, unknown>,
  errors: {} as Record<string, string>,
  plans: [] as { eligible: boolean }[],
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const query: Record<string, unknown> = {};
      for (const op of [
        "select",
        "eq",
        "neq",
        "gt",
        "gte",
        "lt",
        "in",
        "is",
        "not",
        "or",
        "like",
        "order",
        "limit",
        "range",
      ])
        query[op] = () => query;
      const result = () =>
        db.errors[table]
          ? { data: null, error: { message: db.errors[table] } }
          : { data: db.rows[table] ?? [], error: null };
      query["single"] = async () => ({ data: { enabled: true }, error: null });
      query["maybeSingle"] = async () => result();
      query["then"] = (resolve: (value: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve);
      return query;
    },
  },
}));
vi.mock("@/lib/broadcast-rules", async (original) => ({
  ...(await original<typeof import("@/lib/broadcast-rules")>()),
  planFireBroadcast: (args: { eligible: boolean }) => {
    db.plans.push(args);
    return null;
  },
}));
import { publishBroadcasts } from "@/lib/ingest/broadcast.server";

const cluster = {
  id: "f1",
  short_id: "ABC12",
  state: "active",
  lat: 36.7,
  lon: 4.0,
  confidence: 0.9,
  detection_count: 3,
  spread_bearing_deg: null,
  first_detected_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  last_detected_at: new Date(Date.now() - 3_600_000).toISOString(),
  nearest_settlement_id: null,
  nearest_settlement_km: null,
  commune_id: "c1",
  max_frp_mw: 20,
  confirmed_at: null,
};
const commune = (forest: number) => ({
  id: "c1",
  code: "1501",
  level: "commune",
  parent_id: null,
  lat: 36.7,
  lon: 4.0,
  name_fr: "Commune",
  name_ar: "بلدية",
  name_en: "Commune",
  name_kab: null,
  forest_fraction: forest,
});

beforeEach(() => {
  db.errors = {};
  db.plans = [];
  db.rows = { fire_clusters: [cluster], admin_units: [commune(0)] };
});

it("lets a probable fire start a thread and holds back a heat signal", async () => {
  await publishBroadcasts();
  expect(db.plans.map((p) => p.eligible)).toEqual([false]);
  db.plans = [];
  db.rows["admin_units"] = [commune(0.4)];
  await publishBroadcasts();
  expect(db.plans.map((p) => p.eligible)).toEqual([true]);
});

it("still plans every open thread when context is unavailable, then fails loudly", async () => {
  db.rows["admin_units"] = [commune(0.4)];
  db.errors["risk_publication_checkpoint"] = "checkpoint unavailable";
  await expect(publishBroadcasts()).rejects.toThrow("checkpoint unavailable");
  expect(db.plans.map((p) => p.eligible)).toEqual([false]);
});
