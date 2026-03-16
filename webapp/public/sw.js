const SW_URL = new URL(self.location.href);
const VERSION = SW_URL.searchParams.get("v") || "dev";
const APP_CACHE = `ggolf-app-${VERSION}`;
const DATA_CACHE = `ggolf-data-${VERSION}`;
const TILE_CACHE = `ggolf-tiles-${VERSION}`;
const TILE_CACHE_MAX = 180;

const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/icons/icon-maskable-192.svg",
  "/icons/icon-maskable-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => ![APP_CACHE, DATA_CACHE, TILE_CACHE].includes(key))
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || (await networkPromise) || Response.error();
}

async function networkFirst(request, cacheName, fallbackUrl = null) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    return Response.error();
  }
}

async function enforceTileLimit() {
  const cache = await caches.open(TILE_CACHE);
  const keys = await cache.keys();
  if (keys.length <= TILE_CACHE_MAX) return;
  const purgeCount = keys.length - TILE_CACHE_MAX;
  await Promise.all(keys.slice(0, purgeCount).map((key) => cache.delete(key)));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.pathname.startsWith("/data/")) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }

  if (url.hostname.includes("tile.openstreetmap.org")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(TILE_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) {
            await cache.put(request, response.clone());
            await enforceTileLimit();
          }
          return response;
        } catch {
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, APP_CACHE, "/"));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, APP_CACHE));
});
