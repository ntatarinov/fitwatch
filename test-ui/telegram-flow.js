// Вход и привязка Telegram через интерфейс (новая схема, OpenID). Окна входа Telegram здесь нет: библиотека Telegram заменена заглушкой,
// которая выдаёт id_token, подписанный тестовым ключом, а сервер проверяет его по тестовым открытым ключам. Реальный вход проверяется на живом сайте.
// Запуск: npm i --no-save jsdom @electric-sql/pglite && node test-ui/telegram-flow.js
process.env.TELEGRAM_CLIENT_ID = "8927501590";
delete process.env.TELEGRAM_BOT_TOKEN;
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const { JSDOM, VirtualConsole } = require("jsdom");
const ROOT = path.join(__dirname, "..");
const { handle } = require(path.join(ROOT, "api/_lib/app.js"));
const { migrate } = require(path.join(ROOT, "api/_lib/db.js"));

let n = 0, failed = 0;
const ok = (c, name) => { n++; if (!c) { failed++; console.log("FAIL:", name); } else console.log("ok  :", name); };
const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (f()) return true; } catch (e) { /* ждём */ } await tick(15); } return false; };
const TG = require(path.join(ROOT, "api/_lib/telegram.js"));
const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const JWKS = { keys: [Object.assign(rsa.publicKey.export({ format: "jwk" }), { alg: "RS256", kid: "oidc-1" })] };
TG.setJwksProvider(async () => JWKS);
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
// id_token как у Telegram: подпись RS256, издатель, адресат (Client ID), срок, nonce из запроса
function token(user, nonce, tamper) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: "https://oauth.telegram.org", aud: "8927501590", sub: String(user.id), id: user.id, name: user.name, preferred_username: user.username, iat: now, exp: now + 600, nonce };
  const head = b64({ alg: "RS256", typ: "JWT", kid: "oidc-1" }), signed = head + "." + b64(payload);
  const sig = crypto.sign("sha256", Buffer.from(signed), rsa.privateKey).toString("base64url");
  // подделка: данные подменены уже после подписи
  return tamper ? head + "." + b64(Object.assign({}, payload, { id: 1, sub: "1" })) + "." + sig : signed + "." + sig;
}

function openApp(db, ip) {
  let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => "<script>" + fs.readFileSync(path.join(ROOT, src), "utf8").replace(/<\/script>/g, "<\\/script>") + "</script>");
  const errors = [], vc = new VirtualConsole();
  vc.on("jsdomError", e => errors.push(String(e.stack || e).split("\n")[0])); vc.on("error", e => errors.push(String(e)));
  let cookie = "";
  const dom = new JSDOM(html, {
    url: "http://localhost/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.scrollTo = () => {}; w.HTMLCanvasElement.prototype.getContext = () => null;
      w.__tgCalls = [];
      w.Telegram = { Login: { auth(opts, cb) { w.__tgCalls.push(opts); const m = w.__tgMode || "ok"; setTimeout(() => cb(m === "closed" ? { error: "popup_closed" } : m === "error" ? { error: "access_denied" } : { id_token: token(w.__tgUser, opts.nonce, m === "forged"), user: {} }), 5); } } };
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
const go = async (w, h) => { w.location.hash = h; await tick(60); };
const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const submit = (w, form) => form.dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true }));

(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite();
  const db = { query: async (t, p) => (await pg.query(t, p || [])).rows };
  await migrate(db);

  const press = async (w, user, mode) => { w.__tgUser = user; w.__tgMode = mode || "ok"; click(w, $(w, ".tg-btn")); await tick(120); };
  // ---- кнопка и вход ----
  const a = openApp(db, "10.7.0.1");
  await tick(100);
  await go(a.w, "#/account");
  ok(await until(() => !!$(a.w, ".tg-btn") && !$(a.w, ".tg-btn").disabled), "на странице входа появилась кнопка Telegram и готова (nonce получен)");
  ok(!$(a.w, "head script[src*=telegram]"), "библиотека Telegram не подключается второй раз, если уже загружена");
  ok(/Без пароля и почты/.test(text(a.w, "#tgbox")) && /соглашаетесь/.test(text(a.w, "#tgbox")), "рядом указано согласие на хранение данных");
  await press(a.w, { id: 9001, name: "Марат Ким", username: "marat_fit" }, "forged");
  ok(a.w.Account.state.status === "anon" && /Не удалось подтвердить/.test(text(a.w, ".toasts")), "подделанный токен отклонён с понятным сообщением");
  ok(await until(() => !$(a.w, ".tg-btn").disabled), "после отказа кнопка снова готова (новый nonce)");
  await press(a.w, { id: 9001, name: "Марат Ким", username: "marat_fit" }, "closed");
  ok(a.w.Account.state.status === "anon" && !$$(a.w, ".toast").some(t => /не удался/.test(t.textContent)), "закрытое окно входа не считается ошибкой");
  await until(() => !$(a.w, ".tg-btn").disabled);
  await press(a.w, { id: 9001, name: "Марат Ким", username: "marat_fit" }, "error");
  ok(/не удался/.test(text(a.w, ".toasts")), "отказ Telegram показан сообщением");
  await until(() => !$(a.w, ".tg-btn").disabled);
  await press(a.w, { id: 9001, name: "Марат Ким", username: "marat_fit" });
  const opts = a.w.__tgCalls[a.w.__tgCalls.length - 1];
  ok(opts.client_id === 8927501590 && opts.scope.includes("write") && typeof opts.nonce === "string" && opts.nonce.length >= 16, "в Telegram передаются Client ID, право писать боту и одноразовое значение");
  ok(await until(() => a.w.Account.state.status === "user" && a.w.location.hash === "#/rating"), "вход через Telegram выполнен, открыт рейтинг");
  ok(a.w.Account.state.user.name === "Марат Ким" && a.w.Account.state.user.email === null && a.w.Account.state.user.telegram.linked, "аккаунт создан без почты, имя из Telegram");
  await go(a.w, "#/account");
  ok(await until(() => /Вход через Telegram · Telegram @marat_fit/.test(text(a.w, "main"))) && !$(a.w, ".tg-btn"), "в аккаунте видно вход через Telegram, привязывать нечего");

  // ---- удаление аккаунта без пароля ----
  a.w.prompt = () => "нет";
  click(a.w, $(a.w, "#delacc")); await tick(80);
  ok(a.w.Account.state.status === "user", "неверное слово подтверждения: аккаунт остался");
  a.w.prompt = () => "удалить";
  click(a.w, $(a.w, "#delacc"));
  ok(await until(() => a.w.Account.state.status === "anon"), "слово УДАЛИТЬ: аккаунт удалён");
  ok(Number((await db.query("SELECT count(*)::int AS n FROM users WHERE telegram_id = 9001"))[0].n) === 0, "данные удалены с сервера");

  // ---- привязка к аккаунту с почтой ----
  const b = openApp(db, "10.7.0.2");
  await tick(100);
  await go(b.w, "#/account/register");
  const f = $(b.w, "#acform").elements; f.name.value = "Дана"; f.email.value = "dana@test.kz"; f.password.value = "password-123"; f.consent.checked = true;
  submit(b.w, $(b.w, "#acform"));
  await until(() => b.w.Account.state.status === "user");
  await go(b.w, "#/account");
  ok(await until(() => !!$(b.w, ".tg-btn") && !$(b.w, ".tg-btn").disabled) && /Привязать Telegram/.test(text(b.w, "main")), "у аккаунта с почтой предлагается привязать Telegram");
  await press(b.w, { id: 9002, name: "Дана", username: "dana_tg" });
  ok(await until(() => b.w.Account.state.user && b.w.Account.state.user.telegram.linked), "Telegram привязан");
  ok(await until(() => /dana@test.kz · Telegram @dana_tg/.test(text(b.w, "main"))), "в аккаунте видны и почта, и Telegram");
  // тот же человек входит через Telegram с другого устройства и попадает в тот же аккаунт
  const c = openApp(db, "10.7.0.3");
  await tick(100);
  await go(c.w, "#/account");
  await until(() => !!$(c.w, ".tg-btn") && !$(c.w, ".tg-btn").disabled);
  await press(c.w, { id: 9002, name: "Дана", username: "dana_tg" });
  ok(await until(() => c.w.Account.state.status === "user" && c.w.Account.state.user.email === "dana@test.kz"), "вход через Telegram открывает тот же аккаунт с почтой");
  // чужой Telegram занять нельзя
  const d = openApp(db, "10.7.0.4");
  await tick(100);
  await go(d.w, "#/account/register");
  const g = $(d.w, "#acform").elements; g.name.value = "Берик"; g.email.value = "berik@test.kz"; g.password.value = "password-123"; g.consent.checked = true;
  submit(d.w, $(d.w, "#acform"));
  await until(() => d.w.Account.state.status === "user");
  await go(d.w, "#/account");
  await until(() => !!$(d.w, ".tg-btn") && !$(d.w, ".tg-btn").disabled);
  await press(d.w, { id: 9002, name: "Дана", username: "dana_tg" });
  ok(/уже привязан к другому/.test(text(d.w, ".toasts")) && !d.w.Account.state.user.telegram.linked, "чужой Telegram привязать нельзя");

  // ---- вход не настроен: кнопки нет, вход по почте работает ----
  const saved = process.env.TELEGRAM_CLIENT_ID; delete process.env.TELEGRAM_CLIENT_ID;
  const e = openApp(db, "10.7.0.5");
  await tick(100);
  await go(e.w, "#/account");
  ok(await until(() => !$(e.w, "#tgbox")) && !!$(e.w, "#acform"), "без настроек блок Telegram скрыт, форма почты на месте");
  process.env.TELEGRAM_CLIENT_ID = saved;

  const errs = [a, b, c, d, e].flatMap(x => x.errors);
  ok(errs.length === 0, "ошибок скриптов нет: " + errs.slice(0, 3).join(" | "));
  console.log(`\nпроверок: ${n}, не прошло: ${failed}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("СБОЙ СЦЕНАРИЯ:", e); process.exit(2); });
