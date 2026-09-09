import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const worker = readFileSync(
  new URL("../../../public/sw.js", import.meta.url),
  "utf8",
);
function setup() {
  const stores = new Map<string, Map<string, Response>>();
  const handlers = new Map<string, (event: Record<string, unknown>) => void>();
  let offline = false;
  let missing = false;
  let serial = 0;
  let storageBlocked = false;
  let cleanupBlocked = false;
  let claims = 0;
  const key = (value: string | { url: string }) =>
    new URL(typeof value === "string" ? value : value.url, "https://app.test")
      .href;
  const caches = {
    keys: async () => {
      if (storageBlocked) throw new Error("storage blocked");
      return [...stores.keys()];
    },
    open: async (name: string) => {
      if (storageBlocked) throw new Error("storage blocked");
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        match: async (request: string | { url: string }) =>
          store.get(key(request))?.clone(),
        put: async (request: string | { url: string }, response: Response) => {
          store.set(key(request), response.clone());
        },
      };
    },
    delete: async (name: string) => {
      if (cleanupBlocked) throw new Error("cleanup blocked");
      return stores.delete(name);
    },
  };
  runInNewContext(worker, {
    self: {
      clients: {
        claim: async () => {
          claims++;
        },
      },
      addEventListener: (
        name: string,
        handler: (e: Record<string, unknown>) => void,
      ) => handlers.set(name, handler),
    },
    caches,
    location: { origin: "https://app.test" },
    URL,
    Response,
    TextDecoder,
    Date: { now: () => ++serial },
    fetch: async (input: string | { url: string }) => {
      if (offline) throw new Error("offline");
      const url = key(input);
      if (url.endsWith("client.js"))
        return new Response(
          'import "./guidance.js"; import "./app.css"; const deps=["assets/lazy.js"];',
        );
      if (url.endsWith("lazy.js")) return new Response("lazy guidance");
      if (url.endsWith("guidance.js"))
        return new Response("bundled guidance", {
          status: missing ? 500 : 200,
        });
      if (url.endsWith("app.css"))
        return new Response('src:url("./font.woff2")');
      if (url.endsWith("font.woff2")) return new Response("font");
      return new Response(
        '<html><script type="module" src="/assets/client.js"></script></html>',
      );
    },
  });
  return {
    stores,
    claimCount: () => claims,
    activate: async () => {
      let work: Promise<unknown> | undefined;
      handlers.get("activate")!({
        waitUntil: (p: Promise<unknown>) => {
          work = p;
        },
      });
      await work;
    },
    blockStorage: () => {
      storageBlocked = true;
    },
    blockCleanup: () => {
      cleanupBlocked = true;
    },
    offline: () => {
      offline = true;
    },
    missing: () => {
      missing = true;
    },
    prepare: async () => {
      let result: unknown;
      let work: Promise<unknown> | undefined;
      handlers.get("message")!({
        data: { type: "PREPARE_SURVIVAL" },
        ports: [
          {
            postMessage: (value: unknown) => {
              result = value;
            },
          },
        ],
        waitUntil: (p: Promise<unknown>) => {
          work = p;
        },
      });
      await work;
      return result;
    },
    navigate: async (path: string) => {
      let response: Promise<Response> | undefined;
      handlers.get("fetch")!({
        request: {
          url: `https://app.test${path}`,
          method: "GET",
          mode: "navigate",
        },
        respondWith: (r: Promise<Response>) => {
          response = r;
        },
      });
      return response!;
    },
  };
}

it("prepares every route and transitive guidance/font asset for cold offline navigation", async () => {
  const sw = setup();
  expect(await sw.prepare()).toEqual({ ok: true });
  sw.offline();
  for (const path of [
    "/survival",
    "/survival/sos",
    "/survival/areas",
    "/survival/checkin",
  ]) {
    const response = await sw.navigate(path);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("client.js");
  }
  const entries = [...sw.stores.values()].flatMap((store) => [...store.keys()]);
  expect(entries).toContain("https://app.test/assets/guidance.js");
  expect(entries).toContain("https://app.test/assets/font.woff2");
  expect(entries).toContain("https://app.test/assets/lazy.js");
  expect(entries).not.toContain("https://app.test/assets/assets/lazy.js");
});
it("rejects missing assets and retains the previously prepared shell", async () => {
  const sw = setup();
  expect(await sw.prepare()).toEqual({ ok: true });
  sw.missing();
  expect(await sw.prepare()).toEqual({ ok: false });
  sw.offline();
  expect((await sw.navigate("/survival/sos")).status).toBe(200);
});
it("does not claim an unprepared offline shell is ready", async () => {
  const sw = setup();
  sw.offline();
  expect((await sw.navigate("/survival")).status).toBe(503);
});

it("keeps the newly committed shell usable when old-cache cleanup fails", async () => {
  const sw = setup();
  expect(await sw.prepare()).toEqual({ ok: true });
  sw.blockCleanup();
  expect(await sw.prepare()).toEqual({ ok: true });
  sw.offline();
  expect((await sw.navigate("/survival/areas")).status).toBe(200);
});
it("returns online assets and the offline unavailable fallback with blocked caches", async () => {
  const sw = setup();
  sw.blockStorage();
  expect((await sw.navigate("/assets/client.js")).status).toBe(200);
  expect(await sw.prepare()).toEqual({ ok: false });
  sw.offline();
  expect((await sw.navigate("/survival")).status).toBe(503);
});

it("activation removes only obsolete and orphaned owned caches, preserving the selected pack", async () => {
  const sw = setup();
  await sw.prepare();
  for (const name of [
    "nadhir-sw-v1-assets",
    "nadhir-sw-v1-pages",
    "nadhir-sw-v2-pack-999",
    "nadhir-sw-v2-assets",
    "another-app-cache",
  ])
    sw.stores.set(name, new Map());
  await sw.activate();
  expect([...sw.stores.keys()].sort()).toEqual(
    [
      "another-app-cache",
      "nadhir-survival-control",
      "nadhir-sw-v2-assets",
      "nadhir-sw-v2-pack-1",
    ].sort(),
  );
  expect(sw.claimCount()).toBe(1);
  sw.offline();
  expect((await sw.navigate("/survival")).status).toBe(200);
});
it("activation claims clients without deleting any pack if storage or marker reads fail", async () => {
  const sw = setup();
  await sw.prepare();
  sw.stores.set("nadhir-sw-v1-pages", new Map());
  const original = [...sw.stores.keys()];
  sw.blockStorage();
  await sw.activate();
  expect([...sw.stores.keys()]).toEqual(original);
  expect(sw.claimCount()).toBe(1);
});
it("activation preserves packs when the active marker is malformed", async () => {
  const sw = setup();
  await sw.prepare();
  sw.stores
    .get("nadhir-survival-control")!
    .set("https://app.test/__survival-cache", new Response("broken"));
  sw.stores.set("nadhir-sw-v2-pack-999", new Map());
  await sw.activate();
  expect(sw.stores.has("nadhir-sw-v2-pack-1")).toBe(true);
  expect(sw.stores.has("nadhir-sw-v2-pack-999")).toBe(true);
  expect(sw.claimCount()).toBe(1);
});
it("activation still claims clients if stale-cache deletion fails", async () => {
  const sw = setup();
  await sw.prepare();
  sw.stores.set("nadhir-sw-v1-pages", new Map());
  sw.blockCleanup();
  await sw.activate();
  expect(sw.claimCount()).toBe(1);
  sw.offline();
  expect((await sw.navigate("/survival")).status).toBe(200);
});

it("activation preserves the selected pack even when it belongs to an older worker version", async () => {
  const sw = setup();
  await sw.prepare();
  sw.stores.set("nadhir-sw-v1-pack-7", sw.stores.get("nadhir-sw-v2-pack-1")!);
  sw.stores
    .get("nadhir-survival-control")!
    .set(
      "https://app.test/__survival-cache",
      Response.json({ name: "nadhir-sw-v1-pack-7" }),
    );
  await sw.activate();
  expect(sw.stores.has("nadhir-sw-v1-pack-7")).toBe(true);
  expect(sw.stores.has("nadhir-sw-v2-pack-1")).toBe(false);
  sw.offline();
  expect((await sw.navigate("/survival/areas")).status).toBe(200);
});
