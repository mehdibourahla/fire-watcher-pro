import { describe, expect, it, vi } from "vitest";
import { investigateCivilReport } from "../civil-agent.server";

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
  };
}
describe("civil publication investigation", () => {
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
    expect(result.trace[1]).toMatchObject({
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
