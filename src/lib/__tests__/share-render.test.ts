import { describe, expect, it, vi } from "vitest";

import type { OfficialIncident } from "@/lib/nadhir";
import { handleShareImage, type ShareDeps } from "@/lib/share-render.server";

const updated = "2026-09-27T13:40:00Z";
const version = String(Date.parse(updated));
const incident = {
  id: "i1",
  authority_tier: "national",
  updated_at: updated,
} as OfficialIncident;

function deps(over: Partial<ShareDeps> = {}) {
  const store = new Map<string, Response>();
  const cache = {
    match: async (key: Request) => store.get(key.url)?.clone(),
    put: async (key: Request, res: Response) => void store.set(key.url, res),
  };
  const d: ShareDeps = {
    load: async () => incident,
    screenshot: vi.fn(async () => new Uint8Array([1, 2, 3])),
    cache,
    limit: async () => null,
    ...over,
  };
  return { d, store };
}
const input = (over = {}) => ({
  id: "i1",
  format: "story",
  lang: "fr",
  v: version,
  origin: "https://nadhir.app",
  ...over,
});

describe("handleShareImage", () => {
  it("rejects unknown formats and non-shareable incidents", async () => {
    expect(
      (await handleShareImage(input({ format: "gif" }), deps().d)).status,
    ).toBe(400);
    expect(
      (await handleShareImage(input(), deps({ load: async () => null }).d))
        .status,
    ).toBe(404);
    const media = { ...incident, authority_tier: "media" } as OfficialIncident;
    expect(
      (await handleShareImage(input(), deps({ load: async () => media }).d))
        .status,
    ).toBe(404);
  });

  it("renders the card route once, then serves the cached image", async () => {
    const { d } = deps();
    const first = await handleShareImage(input(), d);
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("image/png");
    expect(first.headers.get("cache-control")).toContain("immutable");
    expect(d.screenshot).toHaveBeenCalledWith(
      "https://nadhir.app/share-card/incident/i1?format=story&lang=fr",
      "story",
    );
    const second = await handleShareImage(input(), d);
    expect(second.status).toBe(200);
    expect(d.screenshot).toHaveBeenCalledTimes(1);
  });

  it("keys the cache on the real version, not the caller's", async () => {
    const { d } = deps();
    const stale = await handleShareImage(input({ v: "1" }), d);
    expect(stale.headers.get("cache-control")).toBe("public, max-age=60");
    await handleShareImage(input(), d);
    expect(d.screenshot).toHaveBeenCalledTimes(1);
  });

  it("answers 503 and caches nothing when the browser fails", async () => {
    const { d, store } = deps({
      screenshot: async () => {
        throw new Error("timeout");
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handleShareImage(input(), d);
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(store.size).toBe(0);
  });

  it("answers 501 where no browser is bound", async () => {
    expect(
      (await handleShareImage(input(), deps({ screenshot: null }).d)).status,
    ).toBe(501);
  });

  it("serves og as JPEG", async () => {
    const res = await handleShareImage(input({ format: "og" }), deps().d);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
  });
});
