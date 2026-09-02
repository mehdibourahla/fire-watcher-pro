import { describe, expect, it } from "vitest";

import {
  mergeDecision,
  nextIncidentState,
  type MergeMention,
  type OpenIncident,
} from "@/lib/text-sources/merge";

const incident: OpenIncident = {
  id: "inc-1",
  area_id: "commune-a",
  kind: "vegetation",
  status: "ongoing",
  precision: "commune",
  commune_id: "commune-a",
  authority_tier: "national",
  first_reported_at: "2026-09-01T06:00:00Z",
  last_reported_at: "2026-09-01T12:00:00Z",
  as_of: "2026-09-01T12:00:00Z",
  place_text: null,
};

function mention(over: Partial<MergeMention>): MergeMention {
  return {
    id: "m-2",
    area_id: "commune-a",
    commune_id: "commune-a",
    kind: "vegetation",
    status: "ongoing",
    precision: "commune",
    authority_tier: "national",
    as_of: "2026-09-01T16:00:00Z",
    evidence: "حريق ببلدية أ، العملية متواصلة",
    place_text: null,
    ...over,
  };
}

describe("mergeDecision", () => {
  it("attaches to the open incident for the same area and kind within 48 hours", () => {
    expect(mergeDecision(mention({}), [incident])).toEqual({
      action: "attach",
      incidentId: "inc-1",
    });
  });

  it("creates a new incident when the last report is older than 48 hours", () => {
    expect(
      mergeDecision(mention({ as_of: "2026-09-04T12:00:00Z" }), [incident]),
    ).toEqual({ action: "create" });
  });

  it("does not merge across kinds or areas", () => {
    expect(
      mergeDecision(mention({ kind: "agricultural" }), [incident]),
    ).toEqual({ action: "create" });
    expect(
      mergeDecision(
        mention({ area_id: "commune-b", commune_id: "commune-b" }),
        [incident],
      ),
    ).toEqual({ action: "create" });
  });

  it("attaches a mention that arrives out of order before the first report", () => {
    expect(
      mergeDecision(mention({ as_of: "2026-08-31T20:00:00Z" }), [incident]),
    ).toEqual({ action: "attach", incidentId: "inc-1" });
  });

  it("prefers the most recently reported candidate", () => {
    const older = {
      ...incident,
      id: "inc-0",
      last_reported_at: "2026-09-01T07:00:00Z",
    };
    expect(mergeDecision(mention({}), [older, incident])).toEqual({
      action: "attach",
      incidentId: "inc-1",
    });
  });
});

describe("nextIncidentState", () => {
  it("lets a newer same-tier mention change the status", () => {
    const next = nextIncidentState(
      incident,
      mention({ status: "extinguished", evidence: "تم إخماده" }),
    );
    expect(next.status).toBe("extinguished");
    expect(next.latest_mention_id).toBe("m-2");
    expect(next.evidence).toBe("تم إخماده");
    expect(next.last_reported_at).toBe("2026-09-01T16:00:00Z");
  });

  it("never lets a lower tier overwrite a higher-tier status", () => {
    const next = nextIncidentState(
      incident,
      mention({ status: "extinguished", authority_tier: "media" }),
    );
    expect(next.status).toBe("ongoing");
    expect(next.authority_tier).toBe("national");
    expect(next.last_reported_at).toBe("2026-09-01T16:00:00Z");
  });

  it("does not move the status backwards in time", () => {
    const next = nextIncidentState(
      incident,
      mention({ status: "extinguished", as_of: "2026-09-01T08:00:00Z" }),
    );
    expect(next.status).toBe("ongoing");
    expect(next.first_reported_at).toBe("2026-09-01T06:00:00Z");
  });

  it("upgrades wilaya precision to commune when a mention names one", () => {
    const wilayaOnly: OpenIncident = {
      ...incident,
      area_id: "wilaya-x",
      commune_id: null,
      precision: "wilaya",
    };
    const next = nextIncidentState(
      wilayaOnly,
      mention({ area_id: "wilaya-x" }),
    );
    expect(next.commune_id).toBe("commune-a");
    expect(next.precision).toBe("commune");
  });
});
