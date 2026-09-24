import { describe, expect, it } from "vitest";
import { groupAlerts, groupPhase } from "@/lib/alert-groups";
import type { Alert } from "@/lib/alerts";

const alert = (over: Partial<Alert>): Alert => ({
  id: "a",
  zone_id: "z1",
  kind: "fire",
  severity: 3,
  cluster_id: "c1",
  commune_id: null,
  source_id: null,
  title: "Fire near Zone",
  body: "",
  distance_km: 2,
  payload: null,
  read_at: null,
  created_at: "2026-09-22T10:00:00Z",
  ...over,
});

describe("groupAlerts", () => {
  it("keeps one row per fire with its newest message first", () => {
    const groups = groupAlerts([
      alert({ id: "new", created_at: "2026-09-22T10:00:00Z" }),
      alert({
        id: "growth",
        created_at: "2026-09-22T11:00:00Z",
        read_at: "2026-09-22T11:05:00Z",
      }),
      alert({
        id: "other",
        cluster_id: "c2",
        created_at: "2026-09-22T09:00:00Z",
      }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["fire:c1", "fire:c2"]);
    expect(groups[0]!.latest.id).toBe("growth");
    expect(groups[0]!.messages.map((m) => m.id)).toEqual(["growth", "new"]);
    expect(groups[0]!.unread).toBe(1);
  });

  it("keeps one risk row per zone and Algiers day", () => {
    const groups = groupAlerts([
      alert({
        id: "r1",
        kind: "risk",
        cluster_id: null,
        created_at: "2026-09-22T06:00:00Z",
      }),
      alert({
        id: "r2",
        kind: "risk",
        cluster_id: null,
        created_at: "2026-09-22T22:30:00Z",
      }),
      alert({
        id: "r3",
        kind: "risk",
        cluster_id: null,
        created_at: "2026-09-22T23:30:00Z",
      }),
    ]);
    expect(groups.map((g) => g.messages.map((m) => m.id))).toEqual([
      ["r3"],
      ["r2", "r1"],
    ]);
  });
});

describe("groupPhase", () => {
  const now = Date.parse("2026-09-22T12:00:00Z");
  const fire = (hours: number, resolved_at: string | null = null) => ({
    state: "active",
    last_detected_at: new Date(now - hours * 3_600_000).toISOString(),
    resolved_at,
  });

  it("shows the fire's current phase, not the phase of the message", () => {
    const [group] = groupAlerts([alert({ payload: { phase: "new" } })]);
    expect(groupPhase(group!, new Map([["c1", fire(1)]]), now)).toBe("live");
    expect(groupPhase(group!, new Map([["c1", fire(10)]]), now)).toBe("fading");
    expect(groupPhase(group!, new Map([["c1", fire(30)]]), now)).toBe(
      "archived",
    );
    expect(groupPhase(group!, new Map(), now)).toBe("archived");
  });

  it("treats a forecast as live only on its own day", () => {
    const [today] = groupAlerts([
      alert({
        kind: "risk",
        cluster_id: null,
        created_at: "2026-09-22T06:00:00Z",
      }),
    ]);
    const [yesterday] = groupAlerts([
      alert({
        kind: "risk",
        cluster_id: null,
        created_at: "2026-09-21T06:00:00Z",
      }),
    ]);
    expect(groupPhase(today!, new Map(), now)).toBe("live");
    expect(groupPhase(yesterday!, new Map(), now)).toBe("archived");
  });
});

describe("hazard alert groups", () => {
  const weather = (over: Partial<Alert>) =>
    alert({
      kind: "weather",
      cluster_id: null,
      source_id: "onm1",
      payload: { expires_at: "2026-09-23T18:00:00Z" },
      ...over,
    });

  it("folds the same warning raised through several zones into one row", () => {
    const groups = groupAlerts([
      weather({ id: "home", zone_id: "z1" }),
      weather({ id: "farm", zone_id: "z2" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["weather:onm1"]);
    expect(groups[0]!.messages).toHaveLength(2);
  });

  it("stays live until the source's own expiry, then archives", () => {
    const [group] = groupAlerts([weather({})]);
    expect(
      groupPhase(group!, new Map(), Date.parse("2026-09-23T17:00:00Z")),
    ).toBe("live");
    expect(
      groupPhase(group!, new Map(), Date.parse("2026-09-23T19:00:00Z")),
    ).toBe("archived");
  });
});
