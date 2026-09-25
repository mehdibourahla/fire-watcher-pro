import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {},
}));
vi.mock("@/lib/source-archive.server", () => ({
  archivedFetch: vi.fn(),
  ArchiveFailure: class extends Error {},
}));

import { ingestEmsc } from "@/lib/ingest/emsc.server";
import sample from "./fixtures/emsc-sample.json";

const communes = async () => [
  { id: "setif", lat: 36.19, lon: 5.41 },
  { id: "ghazaouet", lat: 35.1, lon: -1.86 },
  { id: "alger", lat: 36.75, lon: 3.05 },
];

function deps(response: Response) {
  const stored: unknown[] = [];
  const urls: string[] = [];
  return {
    stored,
    urls,
    deps: {
      fetch: async (url: string) => {
        urls.push(url);
        return response;
      },
      communes,
      upsert: async (rows: unknown[]) => {
        stored.push(...rows);
      },
    },
  };
}

describe("ingestEmsc", () => {
  it("stores the earthquakes near Algeria from the last six hours of updates", async () => {
    const d = deps(new Response(JSON.stringify(sample), { status: 200 }));
    const run = await ingestEmsc(d.deps, () =>
      Date.parse("2026-09-25T12:00:00Z"),
    );
    expect(run).toEqual({ fetched: 4, stored: 3, outside: 1 });
    expect(d.urls[0]).toContain("updatedafter=2026-09-25T06%3A00%3A00.000Z");
    expect(d.stored[0]).toMatchObject({
      id: "20260603_0000366",
      commune_id: "setif",
      magnitude: 4.7,
    });
  });

  it("reads an empty poll as success", async () => {
    const d = deps(new Response(null, { status: 204 }));
    expect(await ingestEmsc(d.deps)).toEqual({
      fetched: 0,
      stored: 0,
      outside: 0,
    });
  });

  it("reports an upstream failure without storing anything", async () => {
    const d = deps(new Response("down", { status: 503 }));
    const run = await ingestEmsc(d.deps);
    expect(run.error).toBe("EMSC 503");
    expect(d.stored).toEqual([]);
  });
});
