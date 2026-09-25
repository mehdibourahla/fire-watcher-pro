import { expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));
import { civilAttentionQuery, itaReportsQuery } from "../admin-ita";

it("reads immutable v1 decisions in both operator histories", async () => {
  const decision = {
    outcome: "review",
    reason: "Ambiguous location",
    area_id: null,
    hazard: "fire",
    summary: "Feu signalé",
    location_evidence: null,
    expires_at: null,
    duplicate_id: null,
  };
  const record = {
    id: "work",
    incident_index: 0,
    civil_decisions: [
      { decision, attempt: 1, created_at: "2026-09-21T10:00:00Z", trace: [] },
    ],
    report: {
      extraction: {
        disposition: "general_information",
        incidents: [],
        review_reasons: [],
      },
    },
  };
  const report = {
    extraction: null,
    civil_publications: [],
    civil_investigations: [record],
  };
  const rowsFor = (rows: unknown[]) => {
    const query = {
      select: () => query,
      in: () => query,
      order: () => query,
      range: async () => ({ data: rows, error: null }),
    };
    return query;
  };
  from.mockImplementation((table: string) =>
    rowsFor(table === "ita_reports" ? [report] : [record]),
  );
  const client = new QueryClient();
  expect(
    (await client.fetchInfiniteQuery(civilAttentionQuery)).pages[0]?.[0]
      ?.history[0]?.decision.official_match,
  ).toBeNull();
  expect(
    (await client.fetchInfiniteQuery(itaReportsQuery())).pages[0]?.[0]
      ?.civil_investigations[0]?.history[0]?.decision.official_match,
  ).toBeNull();
});

it("retrieves unresolved cases beyond the intake and recent-investigation cutoffs", async () => {
  const records = Array.from({ length: 125 }, (_, i) => ({
    id: `work-${i}`,
    report_id: `old-report-${i}`,
    incident_index: 0,
    state: "failed",
    error: "provider timeout",
    civil_decisions: [],
    report: {
      body: "Evidence",
      source_page: "traficalg",
      source_url: "https://example.invalid",
      published_at: "2026-09-21T10:00:00Z",
      extraction: {
        disposition: "general_information",
        incidents: [],
        review_reasons: [],
      },
      civil_publications: [],
    },
  }));
  const query = {
    select: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(async (start: number, end: number) => ({
      data: records.slice(start, end + 1),
      error: null,
    })),
  };
  from.mockReturnValue(query);
  const result = await new QueryClient().fetchInfiniteQuery({
    ...civilAttentionQuery,
    pages: 5,
  });
  expect(from).toHaveBeenCalledWith("civil_investigations");
  expect(query.in).toHaveBeenCalledWith("state", ["review", "failed"]);
  expect(query.select.mock.calls[0]).toEqual([
    expect.stringContaining("report:ita_reports!inner"),
  ]);
  expect(query.range).toHaveBeenCalledWith(100, 124);
  expect(result.pages[4]).toHaveLength(25);
  expect(result.pages[4]?.[0]?.report_id).toBe("old-report-100");
});
