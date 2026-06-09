// Service worker for PWA/offline.
// Strategi:
//  - /api/*           → alltid nett (ingen caching), så data er ferskt.
//  - app-skallet (GET) → NETWORK-FIRST: hent fra nett når online og oppdater
//    cachen; fall tilbake til cache når offline. Dette gjør at nye versjoner av
//    frontend lastes uten manuell cache-bumping, samtidig som appen virker offline.
const CACHE = "slagverk-v3";
const SHELL = ["/", "/index.html", "/app.js", "/styles.css", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);
  // API og alt som ikke er GET/same-origin: la nettet håndtere det direkte.
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Network-first for app-skallet.
  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(request, copy)); }
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match("/index.html")))
  );
});
