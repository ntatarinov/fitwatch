// Сервис-воркер FitWatch: открывает приложение без сети и ускоряет запуск.
// Правила безопасности: запросы к /api/ и чужие адреса он не трогает вообще, ничего личного не кэширует.
// Статика берётся сначала из сети (всегда свежая версия). Кэш — целая оболочка одной версии, записанная при установке:
// без сети приложение открывается из неё, а не из смеси старых и новых файлов. Зависшая сеть ждёт не больше 4 секунд.
const VERSION = "fw-0.9.7";
const SHELL = [
  "/", "/index.html", "/style.css", "/manifest.webmanifest",
  "/data.js", "/catalog.js", "/machines.js", "/nutrition.js", "/planner.js", "/body.js", "/body3d.js", "/ideas.js", "/achievements.js", "/fx.js", "/engine.js", "/tree.js",
  "/photo.js", "/charts.js", "/stats.js", "/icons.js", "/guide.js", "/pwa.js", "/account.js", "/pages.js", "/pages-account.js", "/pages-trainers.js", "/pages-coach.js", "/pages-stats.js", "/pages-guide.js", "/app.js",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png", "/icons/apple-touch-icon.png", "/icons/favicon-32.png",
];

self.addEventListener("install", e => {
  // Всё или ничего: если хоть один файл не скачался, новая версия не ставится и работает прежняя.
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const TIMEOUT_MS = 4000;
const fromCache = req => caches.match(req, { ignoreSearch: req.mode === "navigate" }).then(hit => hit || (req.mode === "navigate" ? caches.match("/index.html") : null));

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith((async () => {
    const net = fetch(req);
    try {
      const first = await Promise.race([net, new Promise(r => setTimeout(r, TIMEOUT_MS, "timeout"))]);
      if (first !== "timeout") return first;
      return (await fromCache(req)) || (await net); // сеть зависла: сохранённая копия, если есть
    } catch (err) {
      return (await fromCache(req)) || Response.error();
    }
  })());
});
