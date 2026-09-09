const VERSION = "nadhir-sw-v2";
const ASSET_CACHE = `${VERSION}-assets`;
const CONTROL_CACHE = "nadhir-survival-control";
const ACTIVE_KEY = "/__survival-cache";
const ROUTES = [
  "/survival",
  "/survival/sos",
  "/survival/areas",
  "/survival/checkin",
];
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 250;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(cleanupOwnedCaches().finally(() => self.clients.claim())),
);

async function cleanupOwnedCaches() {
  try {
    const control = await caches.open(CONTROL_CACHE);
    const entry = await control.match(ACTIVE_KEY);
    const marker = entry ? await entry.json() : null;
    // An unreadable marker must never make an active pack look orphaned.
    if (
      entry &&
      (typeof marker?.name !== "string" ||
        !/^nadhir-sw-v\d+-pack-\d+$/.test(marker.name))
    )
      return;
    const keep = new Set([ASSET_CACHE, CONTROL_CACHE, marker?.name]);
    const names = await caches.keys();
    await Promise.allSettled(
      names
        .filter(
          (name) =>
            /^nadhir-sw-v\d+-(?:assets|pages|pack-\d+)$/.test(name) &&
            !keep.has(name),
        )
        .map((name) => caches.delete(name)),
    );
  } catch {
    // Storage denial or corrupt metadata must not prevent taking control of clients.
  }
}

async function activeCache() {
  const control = await caches.open(CONTROL_CACHE);
  const entry = await control.match(ACTIVE_KEY);
  return entry ? caches.open((await entry.json()).name) : null;
}

function assetReferences(text, base) {
  const matches = [
    ...text.matchAll(
      /["'`(]((?:\/assets\/|\.\/|\.\.\/)?[A-Za-z0-9_./-]+\.(?:js|css|woff2?))(?:["'`)])/g,
    ),
  ];
  return matches.flatMap((match) => {
    const url = new URL(
      match[1].startsWith("assets/") ? `/${match[1]}` : match[1],
      base,
    );
    return url.origin === location.origin && url.pathname.startsWith("/assets/")
      ? [url.href]
      : [];
  });
}

let preparation;
async function prepare() {
  const name = `${VERSION}-pack-${Date.now()}`;
  const cache = await caches.open(name);
  const queue = ROUTES.map((path) => new URL(path, location.origin).href);
  const visited = new Set();
  let bytes = 0;
  let scripts = 0;
  let committed = false;
  try {
    while (queue.length) {
      const url = queue.shift();
      if (visited.has(url)) continue;
      if (visited.size >= MAX_FILES) throw new Error("offline asset limit");
      visited.add(url);
      const response = await fetch(url, {
        credentials: "same-origin",
        cache: "reload",
      });
      if (!response.ok || response.redirected)
        throw new Error("offline response unavailable");
      const body = await response.clone().arrayBuffer();
      bytes += body.byteLength;
      if (bytes > MAX_BYTES) throw new Error("offline size limit");
      const path = new URL(url).pathname;
      if (path.endsWith(".js")) scripts++;
      if (
        path.endsWith(".js") ||
        path.endsWith(".css") ||
        ROUTES.includes(path)
      ) {
        queue.push(...assetReferences(new TextDecoder().decode(body), url));
      }
      await cache.put(url, response);
    }
    if (!scripts) throw new Error("production assets unavailable");
    const control = await caches.open(CONTROL_CACHE);
    const old = await control.match(ACTIVE_KEY);
    await control.put(ACTIVE_KEY, Response.json({ name }));
    committed = true;
    if (old) {
      const previous = await old.json();
      if (previous.name !== name) await caches.delete(previous.name);
    }
  } catch (error) {
    // Cleanup failure after the atomic marker swap must not remove the active pack.
    if (committed) return;
    await caches.delete(name);
    throw error;
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "PREPARE_SURVIVAL") return;
  preparation ??= prepare().finally(() => {
    preparation = undefined;
  });
  event.waitUntil(
    preparation.then(
      () => event.ports[0]?.postMessage({ ok: true }),
      () => event.ports[0]?.postMessage({ ok: false }),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || event.request.method !== "GET") return;
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        let cache;
        try {
          const prepared = await activeCache();
          const ready = await prepared?.match(event.request);
          if (ready) return ready;
          cache = await caches.open(ASSET_CACHE);
          const hit = await cache.match(event.request);
          if (hit) return hit;
        } catch {
          /* Storage denial must not break online assets. */
        }
        const response = await fetch(event.request);
        if (response.ok && cache) {
          try {
            await cache.put(event.request, response.clone());
          } catch {
            /* Explicit preparation reports readiness failures separately. */
          }
        }
        return response;
      })(),
    );
  } else if (
    event.request.mode === "navigate" &&
    ROUTES.includes(url.pathname.replace(/\/$/, ""))
  ) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request);
          if (response.ok) return response;
        } catch {}
        let hit;
        try {
          const cache = await activeCache();
          hit = await cache?.match(
            url.origin + url.pathname.replace(/\/$/, ""),
          );
        } catch {
          /* Render the unavailable fallback when device storage is blocked. */
        }
        return (
          hit ??
          new Response(
            "Offline preparation is unavailable on this device. Civil Protection: 14 · Forest fires: 1070 · Emergency: 112",
            {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            },
          )
        );
      })(),
    );
  }
});
