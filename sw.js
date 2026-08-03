importScripts("./version.js");

const RELEASE_VERSION = self.ADTONA_VERSION || self.PLANTOGUIDE_VERSION || "dev";
const CACHE_NAME = `adtona-${RELEASE_VERSION}`;
const PRECACHE_URLS = [
  "./",
  "index.html",
  "version.js",
  "catalogs.json",
  "dynamic-catalog.js",
  "styles.css",
  "app.js",
  "trip-schema.js",
  "export-styles.js",
  "icon-source.js",
  "photo-store.js",
  "beta-tools.js",
  "adtona-logo.png",
  "adtona-mark.png",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/favicon-16.png",
  "icons/favicon-32.png",
  "icons/apple-touch-icon.png",
  "icons/maskable-192.png",
  "icons/maskable-512.png",
  "icons/adtona-social-1200x630.png"
];
const NETWORK_ONLY_HOSTS = new Set([
  "api.open-meteo.com",
  "geocoding-api.open-meteo.com",
  "en.wikipedia.org",
  "en.wikivoyage.org",
  "www.google.com",
  "maps.google.com"
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => (
        (key.startsWith("adtona-") || key.startsWith("plantoguide-"))
        && !key.startsWith("plantoguide-export-")
        && key !== CACHE_NAME
      )).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (NETWORK_ONLY_HOSTS.has(url.hostname)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "index.html"));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
  }
});

async function cacheFirst(request) {
  // Preserve versioned asset URLs so a release cannot be masked by an older
  // unversioned precache entry. Offline navigation still uses ignoreSearch.
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request, { ignoreSearch: true });
    return cached || caches.match(fallbackUrl, { ignoreSearch: true });
  }
}
