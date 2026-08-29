const VERSION = "nadhir-sw-v1";
const ASSET_CACHE = `${VERSION}-assets`;
const PAGE_CACHE = `${VERSION}-pages`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || event.request.method !== "GET") return;

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const hit = await cache.match(event.request);
        if (hit) return hit;
        const res = await fetch(event.request);
        if (res.ok) void cache.put(event.request, res.clone());
        return res;
      }),
    );
    return;
  }

  // Only the survival shell is kept for offline: it is the one surface that must
  // open when the network is gone.
  if (
    event.request.mode === "navigate" &&
    url.pathname.startsWith("/survival")
  ) {
    event.respondWith(
      caches.open(PAGE_CACHE).then(async (cache) => {
        try {
          const res = await fetch(event.request);
          if (res.ok) void cache.put(event.request, res.clone());
          return res;
        } catch {
          const hit =
            (await cache.match(event.request)) ??
            (await cache.match("/survival"));
          return hit ?? new Response("offline", { status: 503 });
        }
      }),
    );
  }
});
