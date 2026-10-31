const test = require("node:test"), assert = require("node:assert/strict");
const crypto = require("crypto");
process.env.TELEGRAM_BOT_TOKEN = "1234567:TEST-TOKEN-not-real";
process.env.TELEGRAM_BOT_USERNAME = "FitTestBot";
process.env.ADMIN_TELEGRAM_IDS = "777";
const { makeDb, client, newUser } = require("./api.helpers");
const { verifyTelegram } = require("../api/_lib/telegram");
const NOW = Math.floor(new Date("2026-11-02T10:00:00Z").getTime() / 1000);

// Подпись так, как её делает Telegram: HMAC-SHA256 от строки «ключ=значение» по алфавиту, ключ — SHA-256 токена бота.
function sign(data, token) {
  const d = Object.assign({}, data);
  const str = Object.keys(d).sort().map(k => k + "=" + d[k]).join("\n");
  d.hash = crypto.createHmac("sha256", crypto.createHash("sha256").update(token || process.env.TELEGRAM_BOT_TOKEN).digest()).update(str).digest("hex");
  return d;
}
const tg = (id, extra) => sign(Object.assign({ id, first_name: "Алия", username: "aliya_fit", photo_url: "https://t.me/i/userpic/320/x.jpg", auth_date: NOW }, extra || {}));

let db;
test.before(async () => { db = await makeDb(); });
test.after(async () => { if (db) await db.close(); });
const dbtest = (name, fn) => test(name, async t => { if (!db) return t.skip("нет @electric-sql/pglite"); await fn(t); });

test("подпись Telegram: верная принимается, любая подделка нет", () => {
  const T = process.env.TELEGRAM_BOT_TOKEN, d = tg(1001);
  assert.equal(verifyTelegram(d, T, NOW), true);
  assert.equal(verifyTelegram(Object.assign({}, d, { id: 1002 }), T, NOW), false);          // изменили поле
  assert.equal(verifyTelegram(Object.assign({}, d, { first_name: "Другой" }), T, NOW), false);
  assert.equal(verifyTelegram(Object.assign({}, d, { extra: "x" }), T, NOW), false);        // добавили поле
  assert.equal(verifyTelegram(d, "другой:токен", NOW), false);                              // чужой токен
  assert.equal(verifyTelegram(sign({ id: 5, auth_date: NOW - 90000 }), T, NOW), false);     // старше суток
  assert.equal(verifyTelegram(sign({ id: 5, auth_date: NOW - 80000 }), T, NOW), true);
  assert.equal(verifyTelegram(sign({ id: 5, auth_date: NOW + 1000 }), T, NOW), false);      // из будущего
  assert.equal(verifyTelegram(sign({ id: 5, auth_date: "abc" }), T, NOW), false);
  assert.equal(verifyTelegram(Object.assign({}, d, { hash: "zz" }), T, NOW), false);
  assert.equal(verifyTelegram({ id: 1, auth_date: NOW }, T, NOW), false);                   // без подписи
  assert.equal(verifyTelegram(null, T, NOW), false);
});

dbtest("настройки: имя бота публично, токен нигде не отдаётся", async () => {
  const r = await client(db).call("GET", "/api/config");
  assert.deepEqual(r.body, { telegramBot: "FitTestBot", telegramEnabled: true });
  assert.ok(!JSON.stringify(r.body).includes("TEST-TOKEN"));
});

dbtest("вход через Telegram: создание аккаунта, повторный вход, подделка, имя, администратор", async () => {
  const c = client(db, "2026-11-02T10:00:00Z"); c.setIp("20.0.0.1");
  const bad = await c.call("POST", "/api/auth/telegram", Object.assign({}, tg(2001), { first_name: "Взлом" }));
  assert.deepEqual([bad.status, bad.body.error], [401, "Не удалось подтвердить вход через Telegram"]);
  const first = await c.call("POST", "/api/auth/telegram", tg(2001));
  assert.deepEqual([first.status, first.body.created, first.body.user.name], [201, true, "Алия"]);
  assert.match(first.cookies[0], /fw_session=.+; HttpOnly; SameSite=Lax; Path=\/; Max-Age=\d+; Secure/);
  const me = (await c.call("GET", "/api/me")).body;
  assert.deepEqual([me.user.email, me.user.hasPassword, me.user.telegram.linked, me.user.telegram.username, me.user.isAdmin], [null, false, true, "aliya_fit", false]);
  // тот же человек с другого устройства — тот же аккаунт
  const c2 = client(db, "2026-11-02T10:00:00Z"); c2.setIp("20.0.0.2");
  await c2.call("POST", "/api/workouts", {}); // без входа не пройдёт
  const again = await c2.call("POST", "/api/auth/telegram", tg(2001));
  assert.deepEqual([again.status, again.body.created], [200, false]);
  assert.equal(Number((await db.query("SELECT count(*)::int AS n FROM users WHERE telegram_id = 2001"))[0].n), 1);
  // короткое имя и неверное имя пользователя
  const odd = client(db, "2026-11-02T10:00:00Z"); odd.setIp("20.0.0.3");
  const o = await odd.call("POST", "/api/auth/telegram", sign({ id: 2002, first_name: "А", username: "!!", auth_date: NOW }));
  assert.equal(o.body.user.name, "Игрок2002");
  assert.equal((await odd.call("GET", "/api/me")).body.user.telegram.username, null);
  // администратор по идентификатору Telegram
  const adm = client(db, "2026-11-02T10:00:00Z"); adm.setIp("20.0.0.4");
  await adm.call("POST", "/api/auth/telegram", tg(777, { first_name: "Босс" }));
  assert.equal((await adm.call("GET", "/api/me")).body.user.isAdmin, true);
  assert.equal((await adm.call("POST", "/api/admin/promo", { tier: "premium", days: 5, maxUses: 1 })).status, 201);
});

dbtest("ограничение попыток и защита заголовком", async () => {
  const c = client(db, "2026-11-02T10:00:00Z"); c.setIp("20.0.9.9");
  let last;
  for (let i = 0; i < 31; i++) last = await c.call("POST", "/api/auth/telegram", Object.assign({}, tg(3000 + i), { id: 4000 + i }));
  assert.equal(last.status, 429);
  assert.equal((await client(db).call("POST", "/api/auth/telegram", tg(1), { "x-fw": null })).status, 403);
});

dbtest("привязка Telegram к аккаунту с почтой: данные сохраняются, чужой Telegram занять нельзя", async () => {
  const mail = await newUser(db, 800), other = await newUser(db, 801);
  const id = 5001;
  const sess = c => { c.setNow("2026-11-02T10:00:00Z"); return c; };
  await sess(mail).call("POST", "/api/workouts", { day: "2026-11-02", program: "plan", dayId: "w1" });
  const link = await sess(mail).call("POST", "/api/auth/telegram", tg(id));
  assert.deepEqual([link.status, link.body.linked], [200, true]);
  const me = (await mail.call("GET", "/api/me")).body;
  assert.deepEqual([me.user.email, me.user.telegram.linked, me.user.hasPassword], ["u800@test.kz", true, true]);
  assert.equal((await sess(other).call("POST", "/api/auth/telegram", tg(id))).status, 409);   // уже занят
  // вход через Telegram открывает тот же аккаунт со всеми данными
  const c = client(db, "2026-11-02T10:00:00Z"); c.setIp("20.0.1.1");
  const r = await c.call("POST", "/api/auth/telegram", tg(id));
  assert.equal(r.body.created, false);
  assert.equal((await c.call("GET", "/api/me")).body.stats.points, 20);
});

dbtest("аккаунт через Telegram: по почте не войти, удаление требует подтверждения и стирает всё", async () => {
  const c = client(db, "2026-11-02T10:00:00Z"); c.setIp("20.0.2.2");
  await c.call("POST", "/api/auth/telegram", tg(6001));
  await c.call("POST", "/api/workouts", { day: "2026-11-02", program: "plan", dayId: "w1" });
  const row = (await db.query("SELECT email, password_hash FROM users WHERE telegram_id = 6001"))[0];
  assert.deepEqual([row.email, row.password_hash], [null, null]);                              // входа по почте и паролю у такого аккаунта нет
  assert.equal((await c.call("DELETE", "/api/me", {})).status, 403);
  assert.equal((await c.call("DELETE", "/api/me", { confirm: "нет" })).status, 403);
  assert.equal((await c.call("DELETE", "/api/me", { confirm: "DELETE" })).status, 200);
  assert.equal((await c.call("GET", "/api/me")).status, 401);
  assert.equal(Number((await db.query("SELECT count(*)::int AS n FROM users WHERE telegram_id = 6001"))[0].n), 0);
  const back = await client(db, "2026-11-02T10:00:00Z").call("POST", "/api/auth/telegram", tg(6001));
  assert.equal(back.body.created, true);
});

dbtest("база: у пользователя должен быть хотя бы один способ входа", async () => {
  await assert.rejects(() => db.query("INSERT INTO users(display_name) VALUES ('Без входа')"));
  const { migrate } = require("../api/_lib/db");
  await migrate(db);
  await migrate(db);
});

test("без токена вход через Telegram отключён", async t => {
  if (!db) return t.skip("нет @electric-sql/pglite");
  const saved = process.env.TELEGRAM_BOT_TOKEN, data = tg(1, {});   // подпись считаем, пока токен есть
  delete process.env.TELEGRAM_BOT_TOKEN;
  const r = await client(db).call("POST", "/api/auth/telegram", data);
  assert.equal(r.status, 503);
  assert.equal((await client(db).call("GET", "/api/config")).body.telegramEnabled, false);
  process.env.TELEGRAM_BOT_TOKEN = saved;
});
