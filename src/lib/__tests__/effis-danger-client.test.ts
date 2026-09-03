import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: fromMock },
}));

import { effisDangerQuery } from "@/lib/nadhir";

type Row = { commune_id: string; date: string; danger_class: string };

function pagedBuilder(
  pages: Row[][],
  seen: [number, number][],
  orders: [string, boolean][] = [],
) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "limit"])
    builder[method] = vi.fn(() => builder);
  builder["order"] = vi.fn((column: string, opts?: { ascending?: boolean }) => {
    orders.push([column, opts?.ascending !== false]);
    return builder;
  });
  builder["range"] = vi.fn((from: number, to: number) => {
    seen.push([from, to]);
    const page = pages[Math.floor(from / 1000)] ?? [];
    return {
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: page, error: null }).then(resolve),
    };
  });
  return builder;
}

const row = (i: number, date = "2026-09-03"): Row => ({
  commune_id: `c${i}`,
  date,
  danger_class: "extreme",
});

describe("effisDangerQuery", () => {
  beforeEach(() => fromMock.mockReset());

  it("keeps communes past the 1000-row cap PostgREST enforces", async () => {
    const seen: [number, number][] = [];
    const orders: [string, boolean][] = [];
    const first = Array.from({ length: 1000 }, (_, i) => row(i));
    const second = Array.from({ length: 536 }, (_, i) => row(1000 + i));
    fromMock.mockImplementation(() =>
      pagedBuilder([first, second], seen, orders),
    );

    const latest = (await (
      effisDangerQuery.queryFn as unknown as () => Promise<Map<string, Row>>
    )()) as Map<string, Row>;

    expect(latest.size).toBe(1536);
    expect(latest.has("c1535")).toBe(true);
    expect(seen.length).toBeGreaterThan(1);
    // the tiebreak is what makes paging safe: without it a shared date lets a
    // page boundary repeat or drop a commune
    expect(orders.slice(0, 2)).toEqual([
      ["date", false],
      ["commune_id", true],
    ]);
  });

  it("keeps the newest row when a commune appears on more than one day", async () => {
    const page = [row(1, "2026-09-03"), row(1, "2026-09-02")];
    fromMock.mockImplementation(() => pagedBuilder([page], []));

    const latest = (await (
      effisDangerQuery.queryFn as unknown as () => Promise<Map<string, Row>>
    )()) as Map<string, Row>;

    expect(latest.get("c1")?.date).toBe("2026-09-03");
  });
});
