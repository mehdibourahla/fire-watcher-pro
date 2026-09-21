import { expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));
import { civilAttentionQuery } from "../admin-ita";

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
  const result = await new QueryClient().fetchQuery(civilAttentionQuery(2));
  expect(from).toHaveBeenCalledWith("civil_investigations");
  expect(query.in).toHaveBeenCalledWith("state", ["review", "failed"]);
  expect(query.select.mock.calls[0]).toEqual([
    expect.stringContaining("report:ita_reports!inner"),
  ]);
  expect(query.range).toHaveBeenCalledWith(100, 149);
  expect(result).toHaveLength(25);
  expect(result[0]?.report_id).toBe("old-report-100");
});
