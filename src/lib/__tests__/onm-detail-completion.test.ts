import { readFileSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  fetch: vi.fn(),
  failWrite: false,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => {
      let nullField = "";
      let batch = Infinity;
      let patch: Record<string, unknown> | null = null;
      let id = "";
      const query = {
        select: () => query,
        is: (field: string) => {
          nullField = field;
          return query;
        },
        not: () => query,
        order: () => query,
        limit: (count: number) => {
          batch = count;
          return query;
        },
        update: (value: Record<string, unknown>) => {
          patch = value;
          return query;
        },
        eq: (_field: string, value: string) => {
          id = value;
          return query;
        },
        then: (resolve: (result: unknown) => unknown) => {
          if (patch) {
            if (state.failWrite)
              return Promise.resolve({
                error: { message: "write unavailable" },
              }).then(resolve);
            Object.assign(
              state.rows.find((row) => row["id"] === id)!,
              patch,
            );
            return Promise.resolve({ error: null }).then(resolve);
          }
          return Promise.resolve({
            data: state.rows
              .filter((row) => row[nullField] == null)
              .slice(0, batch),
            error: null,
          }).then(resolve);
        },
      };
      return query;
    },
  },
}));
vi.mock("@/lib/source-archive.server", () => ({
  archivedFetch: (...args: unknown[]) => state.fetch(...args),
  ArchiveFailure: class extends Error {},
}));
import { backfillCapDetails } from "../ingest/onm.server";
const xml = readFileSync(
  new URL("./fixtures/onm-cap-sample.xml", import.meta.url),
  "utf8",
).replace(/<headline>[\s\S]*?<\/headline>/g, "");
beforeEach(() => {
  state.rows = Array.from({ length: 21 }, (_, index) => ({
    id: `cap-${index}`,
    cap_url: `https://ametvigilance.meteo.dz/CAPs/${index}.xml`,
    headline_fr: null,
    cap_detail_fetched_at: null,
  }));
  state.failWrite = false;
  state.fetch.mockReset().mockImplementation(async () => new Response(xml));
});
it("finishes valid CAPs without headlines and advances beyond the first twenty", async () => {
  expect(await backfillCapDetails()).toEqual({ filled: 20, failed: 0 });
  expect(await backfillCapDetails()).toEqual({ filled: 1, failed: 0 });
  expect(await backfillCapDetails()).toEqual({ filled: 0, failed: 0 });
  expect(state.fetch).toHaveBeenCalledTimes(21);
  expect(
    state.rows.every((row) => typeof row["cap_detail_fetched_at"] === "string"),
  ).toBe(true);
  expect(state.rows.every((row) => row["headline_fr"] === null)).toBe(true);
});
it.each(["fetch", "parse", "write"])(
  "keeps unsuccessful %s pending for recovery",
  async (kind) => {
    state.rows = state.rows.slice(0, 1);
    if (kind === "fetch")
      state.fetch.mockResolvedValue(
        new Response("unavailable", { status: 503 }),
      );
    if (kind === "parse")
      state.fetch.mockResolvedValue(new Response("invalid CAP"));
    if (kind === "write") state.failWrite = true;
    expect(await backfillCapDetails()).toEqual({ filled: 0, failed: 1 });
    expect(state.rows[0]?.["cap_detail_fetched_at"]).toBeNull();
    state.failWrite = false;
    state.fetch.mockImplementation(async () => new Response(xml));
    expect(await backfillCapDetails()).toEqual({ filled: 1, failed: 0 });
  },
);
