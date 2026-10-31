const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const pkg = JSON.parse(read("package.json"));
const manifest = JSON.parse(read("manifest.webmanifest"));

function pngSize(file) {
  const b = fs.readFileSync(path.join(ROOT, file));
  assert.equal(b.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", file + ": не PNG");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test("манифест: можно установить как приложение (имя, режим, адрес, цвета)", () => {
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.name && manifest.short_name && manifest.short_name.length <= 12);
  assert.equal(manifest.scope, "/");
  assert.ok(manifest.start_url.startsWith("/"));
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
  assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
  assert.equal(manifest.lang, "ru");
});

test("иконки: файлы есть, настоящие PNG нужного размера, есть обычные и маскируемая", () => {
  for (const i of manifest.icons) {
    const [w, h] = i.sizes.split("x").map(Number);
    assert.deepEqual(pngSize(i.src.slice(1)), [w, h], i.src);
  }
  assert.ok(manifest.icons.some(i => i.sizes === "192x192" && i.purpose === "any"));
  assert.ok(manifest.icons.some(i => i.sizes === "512x512" && i.purpose === "any"));
  assert.ok(manifest.icons.some(i => i.purpose === "maskable"));
  assert.deepEqual(pngSize("icons/apple-touch-icon.png"), [180, 180]);
  assert.deepEqual(pngSize("icons/favicon-32.png"), [32, 32]);
  manifest.shortcuts.forEach(s => assert.ok(s.url.startsWith("/") && s.name));
});

test("страница подключает манифест, значки и новые скрипты в правильном порядке", () => {
  const h = read("index.html");
  assert.match(h, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  assert.match(h, /rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png"/);
  assert.match(h, /apple-mobile-web-app-capable/);
  assert.match(h, /viewport-fit=cover/);
  const light = (h.match(/name="theme-color" content="(#[0-9a-f]{6})" media="\(prefers-color-scheme: light\)"/i) || [])[1];
  const dark = (h.match(/name="theme-color" content="(#[0-9a-f]{6})" media="\(prefers-color-scheme: dark\)"/i) || [])[1];
  assert.equal(light, manifest.theme_color, "светлый цвет строки браузера совпадает с манифестом");
  assert.ok(dark && dark !== light, "для тёмной темы свой цвет");
  assert.ok(h.indexOf('<script src="icons.js">') < h.indexOf('<script src="guide.js">'), "значки грузятся раньше гайдов");
  const order = f => h.indexOf(`<script src="${f}">`);
  assert.ok(order("guide.js") > 0 && order("guide.js") < order("pages.js"));
  assert.ok(order("pwa.js") > 0 && order("pwa.js") < order("app.js"));
  assert.ok(order("pages-guide.js") > order("pages-trainers.js") && order("pages-guide.js") < order("app.js"));
});

// ---- сервис-воркер ----
function loadSw() {
  const handlers = {}, store = new Map(), calls = { added: [], deleted: [], put: [], fetched: [] };
  const caches = {
    open: async name => ({ addAll: async list => { list.forEach(u => calls.added.push(name + ":" + u)); }, put: async (r, res) => { calls.put.push(r.url); } }),
    keys: async () => ["old-cache", "fw-" + pkg.version],
    delete: async k => { calls.deleted.push(k); return true; },
    match: async (req, opts) => { const key = typeof req === "string" ? req : req.url; return store.get(key) || (opts && opts.ignoreSearch ? store.get(key.split("?")[0]) : null) || null; },
  };
  const self = { addEventListener: (t, f) => { handlers[t] = f; }, location: { origin: "https://fitwatch.test" }, skipWaiting: () => { calls.skipped = true; }, clients: { claim: async () => { calls.claimed = true; } } };
  const ctx = vm.createContext({ self, caches, URL, Response: { error: () => "ERR" }, Promise, setTimeout, fetch: async req => { calls.fetched.push(req.url); return { ok: true, type: "basic", clone() { return this; } }; } });
  vm.runInContext(read("sw.js"), ctx);
  return { handlers, calls, store, ctx };
}
const fetchEvent = (url, method = "GET", mode = "cors") => { const e = { request: { url, method, mode }, responded: false, respondWith(p) { this.responded = true; this.p = p; } }; return e; };

test("сервис-воркер: версия совпадает с версией проекта, все файлы оболочки существуют", () => {
  const { ctx } = loadSw();
  assert.equal(vm.runInContext("VERSION", ctx), "fw-" + pkg.version);
  const shell = vm.runInContext("SHELL", ctx);
  assert.ok(shell.length > 20);
  shell.filter(u => u !== "/").forEach(u => assert.ok(fs.existsSync(path.join(ROOT, u.slice(1))), "нет файла " + u));
  const h = read("index.html");
  (h.match(/<script src="([^"]+)"/g) || []).map(s => s.match(/"([^"]+)"/)[1]).forEach(f => assert.ok(shell.includes("/" + f), f + " не в списке оболочки"));
});

test("сервис-воркер: не трогает /api/, чужие адреса и не-GET запросы", async () => {
  const { handlers } = loadSw();
  for (const e of [fetchEvent("https://fitwatch.test/api/me"), fetchEvent("https://fitwatch.test/api/auth/login", "POST"), fetchEvent("https://www.youtube.com/iframe_api"), fetchEvent("https://fitwatch.test/style.css", "POST")]) {
    handlers.fetch(e);
    assert.equal(e.responded, false, e.request.url + " " + e.request.method);
  }
});

test("сервис-воркер: статику берёт из сети и не подмешивает её в кэш; без сети отдаёт сохранённое, страницы — главную", async () => {
  const { handlers, calls } = loadSw();
  const e = fetchEvent("https://fitwatch.test/style.css");
  handlers.fetch(e);
  assert.equal(e.responded, true);
  assert.equal((await e.p).ok, true);
  assert.deepEqual(calls.put, [], "в работе кэш не пополняется по одному файлу: только целой оболочкой при установке");
  // сеть пропала
  const off = loadSw();
  off.ctx.fetch = async () => { throw new Error("offline"); };
  off.store.set("https://fitwatch.test/app.js", "CACHED-APP");
  off.store.set("/index.html", "CACHED-INDEX");
  const a = fetchEvent("https://fitwatch.test/app.js"); off.handlers.fetch(a);
  assert.equal(await a.p, "CACHED-APP");
  const n = fetchEvent("https://fitwatch.test/?source=pwa", "GET", "navigate"); off.handlers.fetch(n);
  assert.equal(await n.p, "CACHED-INDEX");
  const miss = fetchEvent("https://fitwatch.test/nope.js"); off.handlers.fetch(miss);
  assert.equal(await miss.p, "ERR");
});

test("сервис-воркер: зависшая сеть не держит приложение дольше 4 секунд, если есть сохранённая копия", async () => {
  const slow = loadSw();
  slow.ctx.fetch = () => new Promise(() => {}); // сеть не отвечает никогда
  slow.store.set("https://fitwatch.test/app.js", "CACHED-APP");
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "sw.js"), "utf8");
  assert.match(src, /TIMEOUT_MS = 4000/);
  // ускоряем ожидание для теста: подменяем setTimeout на мгновенный
  slow.ctx.setTimeout = (fn, ms, arg) => setTimeout(fn, 1, arg);
  const ev = fetchEvent("https://fitwatch.test/app.js"); slow.handlers.fetch(ev);
  assert.equal(await ev.p, "CACHED-APP");
});

test("сервис-воркер: при установке кладёт оболочку, при запуске удаляет старые кэши", async () => {
  const { handlers, calls, ctx } = loadSw();
  let waited; handlers.install({ waitUntil: p => { waited = p; } }); await waited;
  assert.ok(calls.added.length > 20 && calls.added.every(a => a.startsWith("fw-" + pkg.version + ":")));
  assert.equal(calls.skipped, true);
  handlers.activate({ waitUntil: p => { waited = p; } }); await waited;
  assert.deepEqual(calls.deleted, ["old-cache"]);
  assert.equal(calls.claimed, true);
});

test("заголовки на Vercel: сервис-воркер без кэша, манифест с нужным типом", () => {
  const v = JSON.parse(read("vercel.json")), h = src => (v.headers.find(x => x.source === src) || { headers: [] }).headers;
  assert.ok(h("/sw.js").some(x => x.key === "Cache-Control" && /no-cache/.test(x.value)));
  assert.ok(h("/manifest.webmanifest").some(x => x.key === "Content-Type" && x.value === "application/manifest+json"));
  assert.ok(v.rewrites.some(r => r.source === "/api/:path*"), "переписывание API не потеряно");
});

// ---- установка ----
function freshPwa(env) {
  Object.defineProperty(globalThis, "navigator", { value: env.nav || {}, configurable: true, writable: true });
  Object.defineProperty(globalThis, "matchMedia", { value: env.standalone ? () => ({ matches: true }) : undefined, configurable: true, writable: true });
  delete require.cache[require.resolve("../pwa.js")];
  return require("../pwa.js");
}

test("установка: состояния и карточка для телефона, iPhone и уже установленного", async () => {
  let P = freshPwa({ nav: { userAgent: "Mozilla/5.0 (Linux; Android 14)" } });
  assert.equal(P.status(), "none");
  assert.equal(P.card(), "");
  P._set({ prompt() { this.called = true; }, userChoice: Promise.resolve({ outcome: "accepted" }), called: false });
  assert.equal(P.status(), "prompt");
  assert.match(P.card({ dismissible: true }), /data-install[^-]/);
  assert.match(P.card({ dismissible: true }), /data-install-x/);
  assert.doesNotMatch(P.card(), /data-install-x/);
  assert.equal(await P.install(), "accepted");
  assert.equal(P.status(), "none", "после показа окна повторно предлагать нечего");
  assert.equal(await P.install(), "unavailable");

  P = freshPwa({ nav: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" } });
  assert.equal(P.status(), "ios");
  assert.match(P.card(), /На экран Домой/);

  P = freshPwa({ nav: { userAgent: "x" }, standalone: true });
  assert.equal(P.status(), "installed");
  assert.equal(P.card(), "");
  P = freshPwa({ nav: { userAgent: "iPhone", standalone: true } });
  assert.equal(P.status(), "installed");
});

test("заголовки безопасности для всех страниц: нельзя встроить сайт в чужую страницу, тип файлов не угадывается", () => {
  const v = JSON.parse(read("vercel.json")), all = (v.headers.find(x => x.source === "/(.*)") || { headers: [] }).headers;
  const get = k => (all.find(h => h.key === k) || {}).value || "";
  assert.equal(get("X-Content-Type-Options"), "nosniff");
  assert.equal(get("X-Frame-Options"), "DENY");
  assert.match(get("Content-Security-Policy"), /frame-ancestors 'none'/);
  assert.ok(get("Referrer-Policy"));
});

test("битый JSON в запросе: понятный ответ 400, а не пустой", async () => {
  const fn = require("../api/index.js");
  let status = 0, json = null;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(b) { json = b; return this; } };
  const req = { method: "POST", url: "/api/auth/login", query: {}, headers: {}, get body() { throw new SyntaxError("Invalid JSON"); } };
  await fn(req, res);
  assert.equal(status, 400);
  assert.equal(json.error, "Неверный формат запроса");
});
