// Сервис-воркер FitWatch: открывает приложение без сети и ускоряет запуск.
// Правила безопасности: запросы к /api/ и чужие адреса он не трогает вообще, ничего личного не кэширует.
// Статика берётся сначала из сети (всегда свежая версия), из кэша только если сети нет.
const VERSION = "fw-0.8.0";
const SHELL = [
  "/", "/index.html", "/style.css", "/manifest.webmanifest",
  "/data.js", "/catalog.js", "/nutrition.js", "/planner.js", "/body.js", "/ideas.js", "/achievements.js", "/fx.js", "/engine.js", "/tree.js",
  "/photo.js", "/charts.js", "/icons.js", "/guide.js", "/pwa.js", "/account.js", "/pages.js", "/pages-account.js", "/pages-trainers.js", "/pages-coach.js", "/pages-guide.js", "/app.js",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png", "/icons/favicon-32.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.ok && res.type === "basic") { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || (req.mode === "navigate" ? caches.match("/index.html") : Response.error())))
  );
});
