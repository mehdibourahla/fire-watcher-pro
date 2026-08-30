import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");
const MIGRATION =
  "supabase/migrations/20260828131723_91fbb889-0ec9-4d2f-827e-0878274cf5a0.sql";

function allowed(table: string, column: string): string[] {
  const sql = read(MIGRATION);
  const re = new RegExp(`CREATE TABLE public\\.${table}[\\s\\S]*?\\n\\);`);
  const block = re.exec(sql)?.[0] ?? "";
  const check = new RegExp(
    `${column}[^,]*?CHECK \\(${column} IN \\(([^)]*)\\)\\)`,
  ).exec(block);
  return (check?.[1] ?? "").split(",").map((s) => s.trim().replace(/'/g, ""));
}

describe("emitted literals satisfy the DB CHECK constraints", () => {
  it("risk_forecasts.source", () => {
    const emitted = /const SOURCE = "([^"]+)"/.exec(
      read("src/lib/ingest/weather.server.ts"),
    )?.[1];
    expect(allowed("risk_forecasts", "source")).toContain(emitted);
  });

  it("detections.source", () => {
    const emitted = /source: "([^"]+)"/.exec(
      read("src/lib/ingest/firms.server.ts"),
    )?.[1];
    expect(allowed("detections", "source")).toContain(emitted);
  });

  it("detections.source — fci ingest", () => {
    const emitted = /source: "([^"]+)"/.exec(
      read("src/lib/ingest/fci.server.ts"),
    )?.[1];
    expect(allowed("detections", "source")).toContain(emitted);
  });

  it("the fci ingest refuses a run whose features all fall outside the watch box", () => {
    // the WFS bbox is lat-first; a silently wrong axis order returns plausible
    // fires in the wrong hemisphere
    const src = read("src/lib/ingest/fci.server.ts");
    expect(src).toMatch(/outside the watch box/);
  });

  it("fusion attaches a commune only to fires inside Algeria", () => {
    const src = read("src/lib/ingest/fusion.server.ts");
    const decided = /const communeId = ([^;\n]+);/.exec(src)?.[1] ?? "";
    expect(decided).toMatch(/isInAlgeriaNorth/);
  });

  it("fire_clusters.state — every state fuseDetections can return", () => {
    const src = read("src/lib/ingest/fusion.server.ts");
    const body = /function stateFor\([\s\S]*?\n}/.exec(src)?.[0] ?? "";
    const returned = [...body.matchAll(/return "([^"]+)"/g)].map((m) => m[1]);
    expect(returned.length).toBeGreaterThan(0);
    for (const state of returned)
      expect(allowed("fire_clusters", "state")).toContain(state);
  });
});

describe("FIRMS silent-death guard", () => {
  it("total feed failure degrades the source instead of reporting ok", () => {
    const src = read("src/lib/ingest/firms.server.ts");
    expect(src).toMatch(
      /feeds\.length === 0[\s\S]{0,200}error: "all FIRMS feeds failed/,
    );
  });
});
