import { readFileSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  upserts: [] as Record<string, unknown>[],
  rpc: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: (...args: unknown[]) => state.rpc(...args),
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        not: () => query,
        order: () => query,
        limit: () => query,
        range: () => query,
        upsert: async (rows: Record<string, unknown>[]) => {
          state.upserts.push(...rows);
          return { error: null };
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return query;
    },
  },
}));
vi.mock("@/lib/source-archive.server", () => ({
  archivedFetch: (...args: unknown[]) => state.fetch(...args),
  ArchiveFailure: class extends Error {},
}));
import { ingestOnm } from "@/lib/ingest/onm.server";

const feed = readFileSync(
  new URL("./fixtures/onm-atom-sample.xml", import.meta.url),
  "utf8",
);

beforeEach(() => {
  state.upserts = [];
  state.rpc.mockReset().mockResolvedValue({ data: 3, error: null });
  state.fetch.mockReset().mockImplementation(async () => new Response(feed));
});

it("hands every feed id and its newest bulletin to the supersession pass", async () => {
  const run = await ingestOnm();
  expect(state.upserts).toHaveLength(4);
  expect(state.upserts.every((row) => !("superseded_at" in row))).toBe(true);
  expect(state.rpc).toHaveBeenCalledWith("supersede_onm_absent", {
    _feed_cap_ids: state.upserts.map((row) => row["cap_id"]),
    _feed_sent: "2026-08-30T15:54:22Z",
  });
  expect(run.superseded).toBe(3);
  expect(run.error).toBeUndefined();
});

it("reports a failed supersession pass instead of swallowing it", async () => {
  state.rpc.mockResolvedValue({ data: null, error: { message: "denied" } });
  const run = await ingestOnm();
  expect(run.error).toBe("ONM supersession failed: denied");
});

it("never runs a supersession pass on an empty feed", async () => {
  state.fetch.mockImplementation(async () => new Response("<feed></feed>"));
  await ingestOnm();
  expect(state.rpc).not.toHaveBeenCalled();
});
