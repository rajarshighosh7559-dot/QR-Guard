const CACHE_NAME = "qr-guard-v3";
const APP_SHELL = [
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-192-maskable.png",
  "/icons/icon-512-maskable.png",
  "/icons/apple-touch-icon.png",
];
const STATIC_DESTINATIONS = new Set(["script", "style", "image", "font"]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shellResponse = await fetch("/");
      if (!shellResponse.ok) throw new Error(`App shell request failed: ${shellResponse.status}`);

      const shellHtml = await shellResponse.clone().text();
      const assets = new Set(
        Array.from(
          shellHtml.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g),
          ([, path]) => new URL(path, self.location.origin).href,
        ),
      );
      const cache = await caches.open(CACHE_NAME);
      await cache.put("/", shellResponse);
      await cache.addAll([...APP_SHELL, ...assets]);
    })(),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith("qr-guard-") && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cachedPage = await caches.match("/");
        return cachedPage ?? new Response("QR Guard is unavailable offline.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }),
    );
    return;
  }

  if (!STATIC_DESTINATIONS.has(request.destination)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const responseCopy = response.clone();
          void caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, responseCopy))
            .catch((error) => console.error("QR Guard could not cache an app resource:", error));
        }
        return response;
      });
    }),
  );
});
