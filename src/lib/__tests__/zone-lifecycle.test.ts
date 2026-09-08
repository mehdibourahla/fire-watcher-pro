import { describe, expect, it } from "vitest";
import { zoneLifecycle } from "../zone-lifecycle";

const cluster = {
  id: "c",
  state: "active",
  est_area_ha: 20,
  max_frp_mw: 40,
  last_detected_at: "2026-09-08T12:00:00Z",
};
const baseline = {
  id: "a",
  user_id: "u",
  zone_id: "z",
  cluster_id: "c",
  created_at: "2026-09-08T11:00:00Z",
  payload: {
    est_area_ha: 10,
    max_frp_mw: 20,
    last_detected_at: "2026-09-08T11:00:00Z",
  },
};
const ended = {
  id: "e",
  cluster_id: "c",
  event: "state:contained_guess",
  at: "2026-09-08T12:00:00Z",
  payload: { from: "active", detections: 2 },
};
const now = new Date("2026-09-08T12:00:00Z");
describe("zone lifecycle", () => {
  it("uses the latest baseline independent of history order and suppresses repeats", () => {
    const grown = {
      ...baseline,
      id: "growth",
      created_at: "2026-09-08T11:50:00Z",
      payload: {
        ...baseline.payload,
        est_area_ha: 20,
        max_frp_mw: 40,
        last_detected_at: "2026-09-08T11:50:00Z",
      },
    };
    expect(
      zoneLifecycle(cluster, [baseline, grown], [], "u", "z", now),
    ).toBeNull();
    expect(
      zoneLifecycle(cluster, [grown, baseline], [], "u", "z", now),
    ).toBeNull();
    expect(
      zoneLifecycle(
        { ...cluster, est_area_ha: 19, max_frp_mw: 39 },
        [baseline],
        [],
        "u",
        "z",
        now,
      ),
    ).toBeNull();
  });
  it("allows later growth after observation reentry using the ended baseline", () => {
    const priorEnd = {
      ...baseline,
      payload: { ...baseline.payload, phase: "observation_ended" },
    };
    expect(zoneLifecycle(cluster, [priorEnd], [], "u", "z", now)?.phase).toBe(
      "growth",
    );
  });
  it("grows from either doubled metric after 45 minutes", () => {
    expect(zoneLifecycle(cluster, [baseline], [], "u", "z", now)?.phase).toBe(
      "growth",
    );
    expect(
      zoneLifecycle(
        { ...cluster, est_area_ha: 11 },
        [baseline],
        [],
        "u",
        "z",
        now,
      )?.phase,
    ).toBe("growth");
    expect(
      zoneLifecycle(
        cluster,
        [baseline],
        [],
        "u",
        "z",
        new Date("2026-09-08T11:44:59Z"),
      ),
    ).toBeNull();
  });
  it("requires scoped, measured history and newer observation", () => {
    for (const history of [
      [],
      [{ ...baseline, user_id: "other" }],
      [{ ...baseline, zone_id: "other" }],
      [{ ...baseline, payload: {} }],
    ])
      expect(zoneLifecycle(cluster, history, [], "u", "z", now)).toBeNull();
    expect(
      zoneLifecycle(
        { ...cluster, last_detected_at: baseline.payload.last_detected_at },
        [baseline],
        [],
        "u",
        "z",
        now,
      ),
    ).toBeNull();
  });
  it("requires an active-to-quiet event after a previous alert", () => {
    const quiet = { ...cluster, state: "contained_guess" };
    expect(
      zoneLifecycle(quiet, [baseline], [ended], "u", "z", now)?.phase,
    ).toBe("observation_ended");
    expect(zoneLifecycle(quiet, [], [ended], "u", "z", now)).toBeNull();
    expect(zoneLifecycle(quiet, [baseline], [], "u", "z", now)).toBeNull();
    expect(
      zoneLifecycle(
        quiet,
        [baseline],
        [{ ...ended, payload: { from: "unconfirmed" } }],
        "u",
        "z",
        now,
      ),
    ).toBeNull();
    expect(
      zoneLifecycle(
        quiet,
        [baseline],
        [{ ...ended, at: "2026-09-08T10:00:00Z" }],
        "u",
        "z",
        now,
      ),
    ).toBeNull();
  });
  it("dedupes end events and never replays them on state reentry", () => {
    const priorEnd = {
      ...baseline,
      id: "end-alert",
      created_at: ended.at,
      payload: { phase: "observation_ended", event_id: "e" },
    };
    expect(
      zoneLifecycle(
        { ...cluster, state: "contained_guess" },
        [baseline, priorEnd],
        [ended],
        "u",
        "z",
        now,
      ),
    ).toBeNull();
    expect(
      zoneLifecycle(cluster, [baseline, priorEnd], [ended], "u", "z", now),
    ).toBeNull();
  });
});
