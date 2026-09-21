import { describe, expect, it, vi } from "vitest";
import { investigateCivilReport } from "../civil-agent.server";
import type { CivilOfficialEvidence } from "../civil-agent";

const area = {
  id: "16000000-0000-4000-8000-000000000010",
  name_fr: "Tipaza",
  name_ar: "تيبازة",
  level: "wilaya",
  parent_id: null as string | null,
};
const input = {
  body: "حادث مرور على مستوى طريق الوطني رقم 11 الرابط بين فوكة البحرية والدواودة البحرية، ولاية تيبازة",
  publishedAt: "2026-09-21T10:00:00Z",
  incident: {
    kind: "collision",
    summary_fr: "Accident RN11",
    evidence: "حادث مرور",
    location_text: "ولاية تيبازة",
    location_evidence: "ولاية تيبازة",
    direction_text: null,
    direction_evidence: null,
    current_status: "unknown",
    status_evidence: null,
    region_assessment: "consistent",
    review_reasons: [],
  } as const,
};
const decision = {
  action: "decide",
  query: null,
  parent_id: null,
  decision: {
    outcome: "publish",
    reason:
      "Le tronçon est situé dans la wilaya citée; commune incertaine sans conséquence sur cette publication à l’échelle de la wilaya.",
    area_id: area.id,
    hazard: "road",
    summary:
      "Accident signalé sur la RN11 entre Fouka Marine et Douaouda Marine (Tipaza).",
    location_evidence: "ولاية تيبازة",
    expires_at: "2026-09-21T16:00:00Z",
    duplicate_id: null,
    official_match: null,
  },
};
function deps(actions: unknown[]) {
  const last = actions.at(-1);
  return {
    model: "test-model",
    now: new Date("2026-09-21T11:00:00Z"),
    complete: vi.fn<Parameters<typeof investigateCivilReport>[1]["complete"]>(
      async () => JSON.stringify(actions.shift() ?? last),
    ),
    searchAreas: vi.fn(async () => [area]),
    recentPublications: vi.fn(async () => []),
    officialReports: vi.fn(async () => [] as CivilOfficialEvidence[]),
  };
}
describe("civil publication investigation", () => {
  it("corrects an invented tool parent within the existing budget without executing it", async () => {
    const tools = deps([
      {
        action: "search_areas",
        query: "Tipaza",
        parent_id: "00000000-0000-0000-0000-000000000000",
        decision: null,
      },
      {
        action: "search_areas",
        query: "Tipaza",
        parent_id: null,
        decision: null,
      },
      decision,
    ]);
    expect((await investigateCivilReport(input, tools)).decision.outcome).toBe(
      "publish",
    );
    expect(tools.searchAreas).toHaveBeenCalledTimes(1);
    expect(tools.complete.mock.calls[1]![0].messages.at(-1)!.content).toContain(
      "unobserved parent",
    );
  });
  it.each([
    [
      "unseen incident",
      { incident_id: "18000000-0000-4000-8000-000000000011" },
      "unobserved official",
    ],
    [
      "unseen mention",
      { mention_id: "19000000-0000-4000-8000-000000000011" },
      "unobserved official",
    ],
    [
      "invented ITA quote",
      { source_quote: "invented" },
      "unsupported comparison quote",
    ],
    [
      "invented official quote",
      { official_quote: "invented" },
      "unsupported comparison quote",
    ],
  ])("rejects %s in an official relationship", async (_, patch, expected) => {
    const tools = deps([
      {
        ...decision,
        decision: {
          ...decision.decision,
          outcome: "discard",
          area_id: null,
          location_evidence: null,
          expires_at: null,
          official_match: {
            incident_id: "18000000-0000-4000-8000-000000000010",
            mention_id: "19000000-0000-4000-8000-000000000010",
            relationship: "duplicate",
            reason: "Même événement",
            source_quote: "حادث مرور",
            official_quote: "حريق",
            ...patch,
          },
        },
      },
    ]);
    tools.officialReports.mockResolvedValue([
      {
        id: "18000000-0000-4000-8000-000000000010",
        mention_id: "19000000-0000-4000-8000-000000000010",
        evidence: "حريق",
        status: "ongoing",
        as_of: input.publishedAt,
        kind: "vegetation",
        place_text: null,
        wilaya_id: area.id,
        commune_id: null,
        source_url: "https://t.me/DGPCDZ/1",
        source_published_at: input.publishedAt,
      },
    ]);
    await expect(investigateCivilReport(input, tools)).rejects.toThrow(
      expected as string,
    );
    expect(tools.complete).toHaveBeenCalledTimes(6);
  });
  it("fails for retry when official evidence is unavailable, never treating it as no match", async () => {
    const tools = deps([decision]);
    tools.officialReports.mockRejectedValue(new Error("database unavailable"));
    await expect(investigateCivilReport(input, tools)).rejects.toThrow(
      "database unavailable",
    );
    expect(tools.complete).not.toHaveBeenCalled();
  });
  it("grounds a cross-source duplicate in observed official evidence", async () => {
    const official = {
      id: "18000000-0000-4000-8000-000000000010",
      mention_id: "19000000-0000-4000-8000-000000000010",
      evidence: "حريق في تيبازة",
      status: "ongoing",
      as_of: input.publishedAt,
      kind: "vegetation",
      place_text: "Tipaza",
      wilaya_id: area.id,
      commune_id: null,
      source_url: "https://t.me/DGPCDZ/1",
      source_published_at: input.publishedAt,
    };
    const tools = deps([
      {
        action: "official_reports",
        query: "تيبازة",
        parent_id: null,
        decision: null,
      },
      {
        ...decision,
        decision: {
          ...decision.decision,
          outcome: "discard",
          area_id: null,
          location_evidence: null,
          expires_at: null,
          official_match: {
            incident_id: official.id,
            mention_id: official.mention_id,
            relationship: "duplicate",
            reason: "Même événement déjà rapporté.",
            source_quote: "حريق في تيبازة",
            official_quote: official.evidence,
          },
        },
      },
    ]);
    tools.officialReports.mockResolvedValue([official]);
    const result = await investigateCivilReport(
      { ...input, body: "حريق في تيبازة", incident: { kind: "fire" } },
      tools,
    );
    expect(result.decision.outcome).toBe("discard");
    expect(result.decision.official_match?.incident_id).toBe(official.id);
    expect(result.trace.at(-1)).toMatchObject({
      action: "official_reports",
      results: [official],
    });
  });
  it("compares quotes against canonical source whitespace", async () => {
    const tools = deps([
      {
        action: "search_areas",
        query: "Tipaza",
        parent_id: null,
        decision: null,
      },
      decision,
    ]);
    const result = await investigateCivilReport(
      { ...input, body: input.body.replace("ولاية تيبازة", "ولاية   تيبازة") },
      tools,
    );
    expect(result.decision.outcome).toBe("publish");
  });
  it("recognizes a parent wilaya returned in a commune's catalogue relationship", async () => {
    const tools = deps([
      {
        action: "search_areas",
        query: "Fouka",
        parent_id: null,
        decision: null,
      },
      decision,
    ]);
    tools.searchAreas.mockResolvedValue([
      {
        ...area,
        id: "17000000-0000-4000-8000-000000000010",
        name_fr: "Fouka",
        level: "commune",
        parent_id: area.id,
      },
    ]);
    expect((await investigateCivilReport(input, tools)).decision.area_id).toBe(
      area.id,
    );
  });
  it("lets the agent investigate again after an unsupported decision", async () => {
    const tools = deps([
      decision,
      {
        action: "search_areas",
        query: "Tipaza",
        parent_id: null,
        decision: null,
      },
      decision,
    ]);
    expect((await investigateCivilReport(input, tools)).decision.area_id).toBe(
      area.id,
    );
    expect(tools.complete.mock.calls[1]![0].messages.at(-1)!.content).toContain(
      "unobserved area",
    );
  });
  it("accepts a valid explicit timezone offset returned by the live model", async () => {
    const tools = deps([
      {
        action: "search_areas",
        query: "Tipaza",
        parent_id: null,
        decision: null,
      },
      {
        ...decision,
        decision: {
          ...decision.decision,
          expires_at: "2026-09-21T17:00:00+01:00",
        },
      },
    ]);
    expect((await investigateCivilReport(input, tools)).decision.outcome).toBe(
      "publish",
    );
  });
  it("investigates an Arabic road section and publishes honestly at wilaya precision", async () => {
    const tools = deps([
      {
        action: "search_areas",
        query: "Tipaza",
        parent_id: null,
        decision: null,
      },
      decision,
    ]);
    const result = await investigateCivilReport(input, tools);
    expect(tools.searchAreas).toHaveBeenCalledWith("Tipaza", null);
    expect(result.decision.outcome).toBe("publish");
    expect(result.trace.at(-1)).toMatchObject({
      action: "search_areas",
      results: [area],
    });
    expect(result.model).toBe("test-model");
  });
  it("does not accept a location invented from model knowledge", async () => {
    await expect(
      investigateCivilReport(input, deps([decision])),
    ).rejects.toThrow("unobserved area");
  });
  it("does not accept invented supporting quotes", async () => {
    const tools = deps([
      {
        action: "search_areas",
        query: "Tipaza",
        parent_id: null,
        decision: null,
      },
      {
        ...decision,
        decision: { ...decision.decision, location_evidence: "Alger" },
      },
    ]);
    await expect(investigateCivilReport(input, tools)).rejects.toThrow(
      "unsupported location",
    );
  });
  it("allows a reasoned review without manufacturing a location", async () => {
    const tools = deps([
      {
        ...decision,
        decision: {
          ...decision.decision,
          outcome: "review",
          area_id: null,
          expires_at: null,
          location_evidence: null,
          reason: "Deux localités homonymes restent possibles.",
        },
      },
    ]);
    expect((await investigateCivilReport(input, tools)).decision.outcome).toBe(
      "review",
    );
  });
  it("cannot discard as a duplicate of an unobserved publication", async () => {
    const tools = deps([
      {
        ...decision,
        decision: {
          ...decision.decision,
          outcome: "discard",
          area_id: null,
          expires_at: null,
          location_evidence: null,
          duplicate_id: area.id,
        },
      },
    ]);
    await expect(investigateCivilReport(input, tools)).rejects.toThrow(
      "unobserved duplicate",
    );
  });
  it("bounds investigation without turning a technical failure into a decision", async () => {
    const tools = deps(
      Array.from({ length: 6 }, () => ({
        action: "search_areas",
        query: "Tipaza",
        parent_id: null,
        decision: null,
      })),
    );
    await expect(investigateCivilReport(input, tools)).rejects.toThrow(
      "budget exhausted",
    );
    expect(tools.complete).toHaveBeenCalledTimes(6);
  });
});
