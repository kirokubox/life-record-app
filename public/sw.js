const CACHE = "life-record-app-v2";
const BASE = "/life-record-app/";
const CORE = [BASE, `${BASE}index.html`, `${BASE}manifest.webmanifest`, `${BASE}assets/app.js`, `${BASE}assets/app.css`];
self.addEventListener("install", (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const request = event.request;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(`${BASE}index.html`, copy));
      return response;
    }).catch(() => caches.match(`${BASE}index.html`).then((cached) => cached || caches.match(BASE))));
    return;
  }
  event.respondWith(fetch(request).then((response) => {
    if (response.ok && new URL(request.url).origin === self.location.origin) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request)));
});
