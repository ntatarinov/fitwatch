// Регрессии по аудиту страниц (jsdom): гонки при медленном сервере, чат, приветствие у вошедшего, перенос данных при входе,
// неотправленные тренировки, две вкладки, испорченное хранилище, переходы после входа, пустые поля.
// Сервер подменён: у каждого адреса своё время ответа. Запуск: npm i --no-save jsdom && node test-ui/audit-flow.js.
const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const ROOT = path.join(__dirname, "..");

// routes(method, path, body) -> { status, body, delay } | undefined (тогда 401: гость)
function boot({ ui, state, routes } = {}) {
  let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => "<script>" + fs.readFileSync(path.join(ROOT, src), "utf8").replace(/<\/script>/g, "<\\/script>") + "</script>");
  const errors = [], vc = new VirtualConsole(), calls = [];
  vc.on("jsdomError", e => errors.push(String(e.stack || e).split("\n")[0]));
  vc.on("error", e => errors.push(String(e)));
  const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) {
    w.scrollTo = () => {}; w.HTMLCanvasElement.prototype.getContext = () => null;
    w.localStorage.setItem("fitwatch.ui", JSON.stringify(ui || { mode: "pro", onboarded: true, welcomeOff: true }));
    if (state !== undefined) w.localStorage.setItem("fitwatch.v1", typeof state === "string" ? state : JSON.stringify(state));
    w.fetch = async (u, init) => {
      init = init || {};
      const U = new URL(u, "http://localhost"), method = init.method || "GET", body = init.body ? JSON.parse(init.body) : undefined;
      calls.push({ method, path: U.pathname + U.search, body });
      const r = (routes && routes(method, U.pathname + U.search, body)) || { status: 401, body: { error: "Нужно войти" } };
      if (r.delay) await new Promise(res => setTimeout(res, r.delay));
      if (r.status === 0) throw new TypeError("Failed to fetch");
      return { ok: r.status < 400, status: r.status, json: async () => r.body };
    };
  } });
  dom.window.confirm = () => true; dom.window.alert = () => {};
  return { w: dom.window, errors, calls };
}
const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));
const $ = (w, s) => w.document.querySelector(s), $$ = (w, s) => Array.from(w.document.querySelectorAll(s));
const text = (w, s) => ($(w, s) || { textContent: "" }).textContent;
const go = async (w, h, ms = 30) => { w.location.hash = h; await tick(ms); };
const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const submit = (w, f) => f.dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true }));
const USER = { id: "u1", name: "Тест", email: "t@t.kz", isTrainer: true, isAdmin: false, ratingOptIn: true, hasPassword: true, telegram: { linked: false } };
const ME = { status: 200, body: { user: USER, profile: {}, stats: { points: 10, streak: 1, workouts: 1 } } };
const today = () => new Date().toISOString().slice(0, 10);
let n = 0, failed = 0;
function ok(c, name) { n++; if (!c) { failed++; console.log("FAIL:", name); } else console.log("ok  :", name); }

(async () => {
  // 1. Медленная страница не рисует себя поверх той, куда человек ушёл
  {
    const { w, errors } = boot({ routes: (m, p) => (p === "/api/me" ? ME : p === "/api/subscription" || p === "/api/trainers" || p === "/api/links" || p === "/api/trainer/me" ? { status: 200, delay: 300, body: { tier: "free", items: [], tiers: [], profile: null } } : undefined) });
    await tick(60);
    await go(w, "#/trainers", 10);
    await go(w, "#/", 10);
    await tick(450);
    ok(/Привет/.test(text(w, "h1")) && w.location.hash === "#/", "медленный ответ «Тренеров» не перекрыл главную");
    ok(errors.length === 0, "без ошибок в консоли");
  }

  // 2. Чат: после ухода опрос не продолжается; двойное нажатие отправляет одно сообщение; один ответ — один пузырь
  {
    let msgs = [], posted = 0;
    const link = { id: 7, role: "client", status: "active", with: { name: "Тренер" }, shareGoals: false, shareResults: false };
    const routes = (m, p, b) => {
      if (p === "/api/me") return ME;
      if (p === "/api/links") return { status: 200, body: { items: [link] } };
      if (p.startsWith("/api/links/7/messages") && m === "GET") { const after = Number((p.split("after=")[1] || "0")); return { status: 200, delay: 120, body: { status: "active", items: msgs.filter(x => x.id > after) } }; }
      if (p === "/api/links/7/messages" && m === "POST") { posted++; msgs.push({ id: msgs.length + 1, mine: true, body: b.body }); return { status: 201, delay: 80, body: { id: msgs.length } }; }
    };
    const { w, calls } = boot({ routes });
    await tick(60);
    await go(w, "#/chat/7", 10);
    await go(w, "#/", 10);
    await tick(300);
    const before = calls.filter(c => c.path.startsWith("/api/links/7/messages")).length;
    await tick(5300);
    ok(calls.filter(c => c.path.startsWith("/api/links/7/messages")).length === before, "ушли из чата до загрузки: опрос не запустился");
    await go(w, "#/chat/7", 400);
    const f = $(w, "#mform");
    f.elements.body.value = "привет";
    submit(w, f); submit(w, f);
    await tick(600);
    ok(posted === 1, "двойное нажатие отправило одно сообщение (" + posted + ")");
    ok($$(w, ".msg").length === 1, "и показан один пузырь (" + $$(w, ".msg").length + ")");
    await go(w, "#/", 10);
  }

  // 3. Вошедший с медленной сетью приветствия не видит; гость видит, а если вошёл — окно закрывается
  {
    const { w } = boot({ ui: { mode: "lite", onboarded: true }, routes: (m, p) => (p === "/api/me" ? Object.assign({ delay: 3000 }, ME) : undefined) });
    await tick(3300);
    ok(w.Account.state.status === "user" && !$(w, "#onboard"), "медленный ответ «вошёл»: приветствие не открылось");
    let logged = false;
    const g = boot({ ui: { mode: "lite", onboarded: true }, routes: (m, p) => (p === "/api/me" ? (logged ? ME : { status: 401, body: { error: "Нужно войти" } }) : undefined) });
    await tick(80);
    ok(!!$(g.w, "#onboard"), "гостю приветствие показано");
    logged = true; await g.w.Account.refresh(); await tick(30);
    ok(!$(g.w, "#onboard") && !g.w.document.body.classList.contains("ob-lock"), "вошёл, пока окно открыто: окно закрылось");
  }

  // 4. Вход в существующий аккаунт не переносит туда данные этого устройства; регистрация — переносит
  {
    const local = { name: "Чужой", log: [{ date: today(), p: "start", d: "d1", points: 20, t: "День 1" }], me: { goal: "lose", level: 1, days: 3, minutes: 30, place: "home", limits: [], weight: 62 } };
    let logged = false;
    const routes = (m, p) => {
      if (p === "/api/me" && m === "GET") return logged ? ME : { status: 401, body: { error: "Нужно войти" } };
      if (p === "/api/auth/login") { logged = true; return { status: 200, body: { user: USER } }; }
      if (p === "/api/auth/register") { logged = true; return { status: 201, body: { user: USER } }; }
      if (p === "/api/me" && m === "PATCH") return { status: 200, body: {} };
      if (p === "/api/workouts/sync") return { status: 200, body: { added: 1, skipped: 0, points: 20 } };
    };
    const a = boot({ state: local, routes });
    await tick(60);
    await go(a.w, "#/account/login", 40);
    const f = $(a.w, "#acform"); f.elements.email.value = "t@t.kz"; f.elements.password.value = "password-1"; submit(a.w, f);
    await tick(200);
    ok(!a.calls.some(c => c.path === "/api/workouts/sync" || (c.path === "/api/me" && c.method === "PATCH")), "вход в существующий аккаунт: ни профиль, ни тренировки не отправлены");
    ok(a.w.location.hash === "#/rating", "после входа — в рейтинг, раз он включён (Pro)");
    logged = false;
    const b = boot({ ui: { mode: "lite", onboarded: true, welcomeOff: true }, state: local, routes });
    await tick(60);
    await go(b.w, "#/account/register", 40);
    const r = $(b.w, "#acform"); r.elements.name.value = "Новый"; r.elements.email.value = "n@t.kz"; r.elements.password.value = "password-1"; r.elements.consent.checked = true; submit(b.w, r);
    await tick(200);
    ok(b.calls.some(c => c.path === "/api/workouts/sync") && b.calls.some(c => c.path === "/api/me" && c.method === "PATCH"), "регистрация: данные этого устройства перенесены в новый аккаунт");
    ok(b.w.location.hash === "#/profile", "после регистрации в Lite (рейтинг выключен) — в профиль, а не в скрытый рейтинг");
  }

  // 5. Тренировка без сети отправляется, когда сервер снова отвечает
  {
    let up = false;
    const routes = (m, p) => {
      if (p === "/api/me") return ME;
      if (p === "/api/workouts" && m === "POST") return up ? { status: 201, body: { bonus: 0 } } : { status: 0 };
    };
    const s1 = boot({ routes });
    await tick(60);
    await go(s1.w, "#/d/start/d1", 30);
    click(s1.w, $(s1.w, "#done"));
    await tick(80);
    const saved = s1.w.localStorage.getItem("fitwatch.v1");
    ok(JSON.parse(saved).log[0].pending === true, "сервер не ответил: тренировка помечена «ждёт отправки»");
    up = true;
    const s2 = boot({ state: saved, routes });
    await tick(150);
    ok(s2.calls.filter(c => c.path === "/api/workouts" && c.method === "POST").length === 1, "при следующем открытии тренировка отправлена");
    ok(!JSON.parse(s2.w.localStorage.getItem("fitwatch.v1")).log[0].pending, "и пометка снята");
  }

  // 6. Вторая вкладка: свежие данные подхватываются, а не затираются
  {
    const { w } = boot({});
    await tick(40);
    const other = { name: "Гость", food: [{ date: today(), name: "Банан", kcal: 105 }] };
    w.localStorage.setItem("fitwatch.v1", JSON.stringify(other));
    w.dispatchEvent(new w.StorageEvent("storage", { key: "fitwatch.v1" }));
    await tick(20);
    await go(w, "#/profile", 20);
    $(w, "#name").value = "Алия"; click(w, $(w, "#saveName"));
    const st = JSON.parse(w.localStorage.getItem("fitwatch.v1"));
    ok(st.food.length === 1 && st.name === "Алия", "запись из другой вкладки сохранилась после изменения в этой");
  }

  // 7. Испорченное хранилище не ломает главную и профиль
  for (const bad of ['{"food":null}', '{"log":null}', '{"sleep":null}', '{"done":null}', '{"checkins":{}}', '{"me":{"goal":"lose"}}', '[]', '"строка"', '{"plan":{"days":5}}']) {
    const { w, errors } = boot({ state: bad });
    await tick(40);
    await go(w, "#/profile", 20);
    await go(w, "#/food", 20);
    await go(w, "#/", 20);
    ok(errors.length === 0 && /Привет/.test(text(w, "h1")), "испорченное " + bad + ": приложение работает " + errors.join(" | "));
  }

  // 8. Мелочи: пустые часы сна, ссылка «назад» из программы
  {
    const { w } = boot({});
    await tick(40);
    await go(w, "#/sleep", 20);
    const f = $(w, "#sform"); f.elements.hours.value = ""; submit(w, f);
    const st = JSON.parse(w.localStorage.getItem("fitwatch.v1") || "{}");
    ok(!(st.sleep || []).length && /Часы/.test(text(w, "#serr")), "пустые часы сна не сохраняются как 0");
    await go(w, "#/p/start", 20);
    ok($(w, "a.back").getAttribute("href") === "#/programs", "«Все программы» ведут к программам, а не на главную");
  }

  console.log(`\nпроверок: ${n}, не прошло: ${failed}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("СБОЙ СЦЕНАРИЯ:", e); process.exit(2); });
