import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {},
}));
vi.mock("@/lib/source-archive.server", () => ({ archivedFetch: vi.fn() }));

import { ingestMetar } from "@/lib/ingest/metar.server";
import sample from "./fixtures/metar-sample.json";

describe("ingestMetar", () => {
  it("never replaces a newer stored report with an older one", async () => {
    const upserted: { station: string }[] = [];
    const run = await ingestMetar({
      fetch: async () => new Response(JSON.stringify(sample)),
      latest: async () => new Map([["DAAG", "2026-09-25T18:00:00.000Z"]]),
      upsert: async (rows) => {
        upserted.push(...(rows as { station: string }[]));
      },
    });
    expect(upserted.map((r) => r.station)).toEqual(["DAAJ", "DAAT"]);
    expect(run).toEqual({ fetched: 3, stored: 2 });
  });
});
