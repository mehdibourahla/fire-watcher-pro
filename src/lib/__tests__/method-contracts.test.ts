import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { methodNotAllowed } from "@/lib/public-api.server";
import { postOnlyMethodNotAllowed } from "@/lib/post-only.server";

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) return routeFiles(p);
    return p.endsWith(".ts") ? [p] : [];
  });
}

describe("405 responses", () => {
  it("read-only routes advertise the safe methods as JSON", async () => {
    const res = methodNotAllowed();
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, HEAD, OPTIONS");
    expect(res.headers.get("Content-Type")).toBe("application/json");
    await expect(res.json()).resolves.toEqual({ error: "method not allowed" });
  });

  it("POST-only routes advertise POST, and OPTIONS where supported", async () => {
    const res = postOnlyMethodNotAllowed();
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
    await expect(res.json()).resolves.toEqual({ error: "method not allowed" });
    expect(postOnlyMethodNotAllowed("POST, OPTIONS").headers.get("Allow")).toBe(
      "POST, OPTIONS",
    );
  });
});

// Without an ANY fallback an unsupported method falls through to the HTML app
// shell and reports 200 — the defect behind F-001/F-007/F-008/F-012.
describe("every API route rejects unsupported methods", () => {
  it("declares an ANY handler", () => {
    const missing = routeFiles("src/routes/api").filter(
      (f) => !readFileSync(f, "utf8").includes("ANY:"),
    );
    expect(missing).toEqual([]);
  });
});
