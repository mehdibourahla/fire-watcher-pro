import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {},
}));
vi.mock("@/lib/source-archive.server", () => ({ archivedFetch: vi.fn() }));

import { ingestMetar } from "@/lib/ingest/metar.server";
import sample from "./fixtures/metar-sample.json";

describe("ingestMetar", () => {
  it("offers every report and counts only the new ones", async () => {
    const offered: { station: string }[] = [];
    const run = await ingestMetar({
      fetch: async () => new Response(JSON.stringify(sample)),
      insert: async (rows) => {
        offered.push(...(rows as { station: string }[]));
        return 1;
      },
    });
    expect(offered.map((r) => r.station)).toEqual([
      "DAAJ",
      "DAAG",
      "DAAG",
      "DAAT",
    ]);
    expect(run).toEqual({ fetched: 4, stored: 1 });
  });
});
