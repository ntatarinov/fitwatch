// Сквозная проверка: интерфейс (jsdom) → запросы к серверу → настоящий Postgres в памяти (PGlite). Только чтение файлов проекта.
// Запуск: npm i --no-save jsdom @electric-sql/pglite && node test-ui/account-flow.js
const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const ROOT = path.join(__dirname, "..");
const { handle } = require(path.join(ROOT, "api/_lib/app.js"));
const { migrate } = require(path.join(ROOT, "api/_lib/db.js"));

let n = 0, failed = 0;
const ok = (c, name) => { n++; if (!c) { failed++; console.log("FAIL:", name); } else console.log("ok  :", name); };
const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (f()) return true; } catch (e) { /* ждём */ } await tick(15); } return false; };

function openApp(db, ip) {
  let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => "<script>" + fs.readFileSync(path.join(ROOT, src), "utf8").replace(/<\/script>/g, "<\\/script>") + "</script>");
  const errors = [], vc = new VirtualConsole();
  vc.on("jsdomError", e => errors.push(String(e.stack || e).split("\n")[0])); vc.on("error", e => errors.push(String(e)));
  let cookie = "";
  const dom = new JSDOM(html, {
    url: "http://localhost/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      try { w.localStorage.setItem("fitwatch.ui", JSON.stringify({ mode: "pro", onboarded: true })); } catch (e) { /* без хранилища */ } 
      w.scrollTo = () => {}; w.HTMLCanvasElement.prototype.getContext = () => null;
      // «Сеть»: запросы страницы идут прямо в серверный код с общей базой, как у настоящих запросов к /api.
      w.fetch = async (url, init) => {
        init = init || {};
        const u = new URL(url, "http://localhost"), headers = { host: "localhost", "x-forwarded-for": ip };
        Object.keys(init.headers || {}).forEach(k => { headers[k.toLowerCase()] = init.headers[k]; });
        if (cookie) headers.cookie = cookie;
        const res = await handle({ method: init.method || "GET", path: u.pathname, query: Object.fromEntries(u.searchParams), body: init.body ? JSON.parse(init.body) : undefined, headers }, { db });
        (res.cookies || []).forEach(sc => { const [k, v] = sc.split(";")[0].split("="); cookie = v === "" ? "" : k + "=" + v; });
        return { ok: res.status < 400, status: res.status, json: async () => res.body };
      };
    },
  });
  dom.window.alert = () => {}; dom.window.confirm = () => true;
  return { w: dom.window, errors };
}
const $ = (w, s) => w.document.querySelector(s), $$ = (w, s) => Array.from(w.document.querySelectorAll(s));
const text = (w, s) => ($(w, s) || { textContent: "" }).textContent;
const go = async (w, h) => { w.location.hash = h; await tick(30); };
const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const submit = (w, form) => form.dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true }));

async function register(w, name, email, consent) {
  await go(w, "#/account/register");
  const f = $(w, "#acform").elements;
  f.name.value = name; f.email.value = email; f.password.value = "password-123"; f.consent.checked = consent;
  submit(w, $(w, "#acform"));
}

(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite();
  const db = { query: async (t, p) => (await pg.query(t, p || [])).rows };
  await migrate(db);

  // ---- 1. без входа ----
  const a = openApp(db, "10.0.0.1");
  await tick(80);
  ok(a.w.Account.state.status === "anon", "без входа: сервер отвечает, статус «аноним»");
  await go(a.w, "#/rating");
  ok(await until(() => /Войти или зарегистрироваться/.test(text(a.w, "main"))), "рейтинг без входа предлагает войти");
  await go(a.w, "#/body");
  ok(/Войди, чтобы вести/.test(text(a.w, "main")), "«Мои данные» без входа предлагают войти");

  // ---- 2. регистрация ----
  await register(a.w, "Алия", "aliya@test.kz", false);
  await until(() => /Нужно согласие/.test(text(a.w, "#acerr")));
  ok(/Нужно согласие/.test(text(a.w, "#acerr")) && a.w.Account.state.status === "anon", "регистрация без согласия отклонена");
  const f = $(a.w, "#acform").elements; f.consent.checked = true; f.password.value = "short";
  submit(a.w, $(a.w, "#acform"));
  ok(await until(() => /Пароль: от 8/.test(text(a.w, "#acerr"))), "короткий пароль: понятное сообщение сервера");
  $(a.w, "#acform").elements.password.value = "password-123";
  submit(a.w, $(a.w, "#acform"));
  ok(await until(() => a.w.location.hash === "#/rating" && a.w.Account.state.status === "user"), "после регистрации: вход выполнен, открыт рейтинг");
  ok(await until(() => /Вы пока не участвуете/.test(text(a.w, "main"))), "рейтинг: предложение участвовать");
  click(a.w, $(a.w, "#joinrate"));
  ok(await until(() => /Алия \(вы\)/.test(text(a.w, "#lb"))), "после включения участия имя видно в рейтинге");

  // ---- 3. тренировка → очки на сервере ----
  await go(a.w, "#/d/start/d1");
  click(a.w, $(a.w, "#done"));
  ok(await until(async () => (await db.query("SELECT count(*)::int AS n FROM workouts"))[0].n === 1, 1500) || (await db.query("SELECT count(*)::int AS n FROM workouts"))[0].n === 1, "тренировка из приложения записана на сервере");
  await tick(80);
  await go(a.w, "#/rating");
  ok(await until(() => /20/.test(text(a.w, ".lb-row.me .pt")) && /1 трен/.test(text(a.w, ".lb-row.me"))), "в рейтинге у игрока 20 очков и 1 тренировка");
  ok(/Бонус за серию/.test(text(a.w, "main")) && /\+5 с третьей/.test(text(a.w, "main")), "правила бонусов объяснены на странице");

  // ---- 4. вес ----
  await go(a.w, "#/body/weight");
  ok(await until(() => /Замеров пока нет/.test(text(a.w, "#bsum"))), "вес: пока пусто");
  const addW = async (v, d) => { const fm = $(a.w, "#bform").elements; fm.value.value = v; fm.day.value = d; submit(a.w, $(a.w, "#bform")); await tick(120); };
  const today = a.w.eval("(function(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})()");
  const week = a.w.eval("(function(){const d=new Date();d.setDate(d.getDate()-7);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})()");
  await addW("82", week); await addW("80.5", today);
  ok(await until(() => $$(a.w, "#bhist .card").length === 2), "вес: два замера в истории");
  ok(!!$(a.w, "#bsum svg.chart") && /80\.5/.test(text(a.w, "#bsum")) && /-1\.5 кг/.test(text(a.w, "#bsum")), "вес: график и изменение −1,5 кг");
  const fm = $(a.w, "#bform").elements; fm.value.value = "5"; submit(a.w, $(a.w, "#bform"));
  ok(await until(() => /Вес: от 30 до 300/.test(text(a.w, "#berr"))), "вес: неверное значение отклонено сервером");
  await go(a.w, "#/body/height");
  const fh = $(a.w, "#bform").elements; fh.value.value = "176"; fh.day.value = today; submit(a.w, $(a.w, "#bform"));
  ok(await until(() => /176/.test(text(a.w, "#bsum"))), "рост сохранён");
  const prof = (await db.query("SELECT weight_kg::float AS w, height_cm::float AS h FROM profiles p JOIN users u ON u.id = p.user_id WHERE u.email = 'aliya@test.kz'"))[0];
  ok(prof.w === 80.5 && prof.h === 176, "профиль на сервере хранит последние вес и рост");

  // ---- 5. второй игрок и порядок в рейтинге ----
  const b = openApp(db, "10.0.0.2");
  await tick(80);
  await register(b.w, "Берик", "berik@test.kz", true);
  await until(() => b.w.Account.state.status === "user");
  await go(b.w, "#/account");
  click(b.w, $(b.w, "#optin")); // включить участие (чекбокс)
  await until(() => b.w.Account.state.user && b.w.Account.state.user.ratingOptIn, 1500);
  await go(b.w, "#/d/stretch/d1"); click(b.w, $(b.w, "#done")); await tick(150);
  await go(a.w, "#/rating/all");
  ok(await until(() => $$(a.w, ".lb-row").length === 2), "в рейтинге два игрока");
  const rows = $$(a.w, ".lb-row").map(r => r.textContent);
  ok(/Алия/.test(rows[0]) && /20/.test(rows[0]) && /Берик/.test(rows[1]) && /10/.test(rows[1]), "порядок: Алия 20 очков, Берик 10 (растяжка)");

  // ---- 6. перенос истории из браузера при регистрации ----
  const c = openApp(db, "10.0.0.3");
  await tick(80);
  await go(c.w, "#/profile");
  click(c.w, $(c.w, "#demo")); await tick(80);
  const localLogs = JSON.parse(c.w.localStorage.getItem("fitwatch.v1")).log.length;
  await register(c.w, "Демо Игрок", "demo@test.kz", true);
  await until(() => c.w.Account.state.status === "user", 3000);
  await tick(250);
  const synced = (await db.query("SELECT count(*)::int AS n FROM workouts w JOIN users u ON u.id = w.user_id WHERE u.email = 'demo@test.kz'"))[0].n;
  ok(localLogs >= 5 && synced === localLogs, "история из браузера перенесена на сервер: " + synced + " из " + localLogs);
  ok(/Перенесено тренировок/.test(text(c.w, ".toasts")), "показано уведомление о переносе");

  // ---- 7. выход, вход, неверный пароль, удаление ----
  await go(a.w, "#/account");
  ok(await until(() => !!$(a.w, "#logout")), "аккаунт: кнопка выхода");
  click(a.w, $(a.w, "#logout"));
  ok(await until(() => a.w.Account.state.status === "anon"), "выход выполнен");
  await go(a.w, "#/account/login");
  let lf = $(a.w, "#acform").elements; lf.email.value = "aliya@test.kz"; lf.password.value = "неверный-пароль";
  submit(a.w, $(a.w, "#acform"));
  ok(await until(() => /Неверная почта или пароль/.test(text(a.w, "#acerr"))), "неверный пароль: общее сообщение");
  lf = $(a.w, "#acform").elements; lf.password.value = "password-123";
  submit(a.w, $(a.w, "#acform"));
  ok(await until(() => a.w.Account.state.status === "user"), "вход с верным паролем");
  await go(a.w, "#/account");
  await until(() => !!$(a.w, "#delacc"));
  a.w.prompt = () => "password-123";
  click(a.w, $(a.w, "#delacc"));
  ok(await until(() => a.w.Account.state.status === "anon", 2500), "аккаунт удалён, вход снят");
  ok((await db.query("SELECT count(*)::int AS n FROM users WHERE email = 'aliya@test.kz'"))[0].n === 0 && (await db.query("SELECT count(*)::int AS n FROM measurements m LEFT JOIN users u ON u.id = m.user_id WHERE u.id IS NULL"))[0].n === 0, "данные удалены с сервера");

  const errs = a.errors.concat(b.errors, c.errors);
  ok(errs.length === 0, "ошибок скриптов нет: " + errs.slice(0, 3).join(" | "));
  console.log(`\nпроверок: ${n}, не прошло: ${failed}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("СБОЙ СЦЕНАРИЯ:", e); process.exit(2); });
