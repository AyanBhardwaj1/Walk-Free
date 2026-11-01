// Walk-Free service worker: the app opens offline with the campuses already
// visited. Pages are network-first (a new deploy shows at once); hashed
// assets are cache-first; pre-built campuses are served from cache and
// refreshed in the background. The API, auth and other sites are never
// cached.
const VERSION = "walk-free-v1";

function strategyFor(url, mode, origin) {
  const u = new URL(url);
  if (u.origin !== origin) return "network";
  if (u.pathname.startsWith("/api/")) return "network";
  if (mode === "navigate") return "page";
  if (u.pathname.startsWith("/assets/")) return "cache-first";
  if (u.pathname.startsWith("/areas/") || u.pathname.startsWith("/landing/"))
    return "stale-while-revalidate";
  if (
    /^\/(icon[\w-]*\.(png|svg)|apple-touch-icon\.png|manifest\.webmanifest)$/.test(
      u.pathname,
    )
  )
    return "stale-while-revalidate";
  return "network";
}
self.walkFreeStrategy = strategyFor;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(["/", "/manifest.webmanifest", "/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function page(request) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    // Every route serves the same app shell; keep the latest one.
    if (response.ok) cache.put("/", response.clone());
    return response;
  } catch {
    return (await cache.match("/")) || Response.error();
  }
}
async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}
async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit || Response.error());
  if (hit) {
    event.waitUntil(fresh);
    return hit;
  }
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const strategy = strategyFor(request.url, request.mode, self.location.origin);
  if (strategy === "page") event.respondWith(page(request));
  else if (strategy === "cache-first") event.respondWith(cacheFirst(request));
  else if (strategy === "stale-while-revalidate")
    event.respondWith(staleWhileRevalidate(request, event));
});
