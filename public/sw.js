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

/** Hashed assets kept; older builds' files are dropped beyond this. */
const MAX_ASSETS = 80;

/** Stores a copy, ignoring a full quota; old hashed assets are pruned. */
async function store(cache, key, response) {
  try {
    await cache.put(key, response);
    const keys = (await cache.keys()).filter((r) =>
      new URL(r.url).pathname.startsWith("/assets/"),
    );
    // Keys come back oldest first.
    await Promise.all(
      keys
        .slice(0, Math.max(0, keys.length - MAX_ASSETS))
        .map((r) => cache.delete(r)),
    );
  } catch {
    /* Storage full or unavailable: the network copy is still served. */
  }
}

/** Keeps the worker alive for a background write, when still allowed. */
function keep(event, promise) {
  try {
    event.waitUntil(promise);
  } catch {
    /* Too late to extend; the write still runs. */
  }
}

async function page(request, event) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    // Every route serves the same app shell; keep the latest one, and only
    // when it is the HTML page (not a file opened directly).
    if (
      response.ok &&
      response.type === "basic" &&
      (response.headers.get("content-type") || "").includes("text/html")
    )
      keep(event, store(cache, "/", response.clone()));
    return response;
  } catch {
    return (await cache.match("/")) || Response.error();
  }
}
async function cacheFirst(request, event) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) keep(event, store(cache, request, response.clone()));
  return response;
}
async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) keep(event, store(cache, request, response.clone()));
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
  if (strategy === "page") event.respondWith(page(request, event));
  else if (strategy === "cache-first")
    event.respondWith(cacheFirst(request, event));
  else if (strategy === "stale-while-revalidate")
    event.respondWith(staleWhileRevalidate(request, event));
});
