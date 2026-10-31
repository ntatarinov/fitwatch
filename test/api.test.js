const test = require("node:test"), assert = require("node:assert/strict");
const { makeDb, client, newUser, handle } = require("./api.helpers");
const S = require("../api/_lib/security");
const A = require("../api/_lib/app");

let db;
test.before(async () => { db = await makeDb(); });
test.after(async () => { if (db) await db.close(); });
// Тест на базе: если PGlite не установлен, пропускается с пояснением.
const dbtest = (name, fn) => test(name, async t => { if (!db) return t.skip("нет @electric-sql/pglite (npm i --no-save @electric-sql/pglite)"); await fn(t); });

test("пароли: хэш проверяется, чужой пароль не подходит, формат неверный не падает", async () => {
  const h = await S.hashPassword("секрет-123");
  assert.match(h, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await S.verifyPassword("секрет-123", h), true);
  assert.equal(await S.verifyPassword("другой", h), false);
  assert.equal(await S.verifyPassword("x", "мусор"), false);
});

test("очки и серия: чистые функции", () => {
  assert.equal(A.bonusFor(1), 0); assert.equal(A.bonusFor(3), 5); assert.equal(A.bonusFor(7), 10);
  assert.equal(A.basePoints("stretch"), 10); assert.equal(A.basePoints("plan"), 20);
  assert.equal(A.streakWith(100, [99, 97, 90]), 3);  // разрыв 7 дней обрывает
  assert.equal(A.streakWith(100, []), 1);
  assert.equal(A.currentStreak(100, [99, 98]), 2);
  assert.equal(A.currentStreak(104, [99]), 0);       // серия сгорела
  assert.equal(A.currentStreak(100, []), 0);
});

dbtest("миграции повторно не ломаются, таблицы на месте", async () => {
  const { migrate } = require("../api/_lib/db");
  await migrate(db);
  const t = (await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")).map(r => r.table_name);
  ["users", "sessions", "profiles", "measurements", "workouts", "login_attempts", "schema_migrations"].forEach(n => assert.ok(t.includes(n), n));
});

dbtest("регистрация: проверки, cookie, дубликат, пароль не хранится открыто", async () => {
  const c = client(db);
  const post = b => c.call("POST", "/api/auth/register", b);
  assert.equal((await post({ email: "нет", password: "password1", name: "Ив" })).status, 400);
  assert.equal((await post({ email: "a@b.kz", password: "short", name: "Иван" })).status, 400);
  assert.equal((await post({ email: "a@b.kz", password: "password1", name: "И" })).status, 400);
  const ok = await post({ email: "Reg@Test.kz", password: "password1", name: "Регина" });
  assert.equal(ok.status, 201);
  assert.match(ok.cookies[0], /fw_session=.+; HttpOnly; SameSite=Lax; Path=\/; Max-Age=\d+; Secure/);
  assert.equal(ok.body.user.email, "reg@test.kz");
  assert.equal((await post({ email: "reg@test.kz", password: "password2", name: "Другая" })).status, 409);
  const row = (await db.query("SELECT password_hash FROM users WHERE email = 'reg@test.kz'"))[0];
  assert.ok(row.password_hash.startsWith("scrypt$") && !row.password_hash.includes("password1"));
  assert.equal((await c.call("GET", "/api/me")).body.user.name, "Регина");
});

dbtest("защита запросов: без заголовка X-FW и с чужим Origin изменения отклоняются", async () => {
  const c = client(db);
  const body = { email: "csrf@test.kz", password: "password1", name: "Сергей" };
  assert.equal((await c.call("POST", "/api/auth/register", body, { "x-fw": null })).status, 403);
  assert.equal((await c.call("POST", "/api/auth/register", body, { origin: "https://evil.example" })).status, 403);
  assert.equal((await c.call("POST", "/api/auth/register", body, { origin: "https://fitwatch.test" })).status, 201);
  assert.equal((await c.call("GET", "/api/health")).status, 200);
});

dbtest("вход и выход: неверный пароль, ограничение попыток, выход закрывает сессию", async () => {
  await newUser(db, 10);
  const c = client(db);
  const bad = await c.call("POST", "/api/auth/login", { email: "u10@test.kz", password: "неверный" }, { "x-forwarded-for": "9.9.9.9" });
  assert.equal(bad.status, 401); assert.equal(bad.body.error, "Неверная почта или пароль");
  assert.equal((await c.call("POST", "/api/auth/login", { email: "нет@test.kz", password: "неверный" }, { "x-forwarded-for": "9.9.9.9" })).body.error, "Неверная почта или пароль");
  assert.equal((await c.call("GET", "/api/me")).status, 401);
  const ok = await c.call("POST", "/api/auth/login", { email: "U10@test.kz", password: "password10" }, { "x-forwarded-for": "8.8.8.8" });
  assert.equal(ok.status, 200);
  assert.equal((await c.call("GET", "/api/me")).status, 200);
  await c.call("POST", "/api/auth/logout", {});
  assert.equal((await c.call("GET", "/api/me")).status, 401);
  // ограничение: 10 неудачных входов с одного адреса
  const a = client(db);
  let last;
  for (let i = 0; i < 11; i++) last = await a.call("POST", "/api/auth/login", { email: "u10@test.kz", password: "x" + i }, { "x-forwarded-for": "7.7.7.7" });
  assert.equal(last.status, 429);
});

dbtest("профиль: проверки значений, сохранение, очистка", async () => {
  const c = await newUser(db, 20);
  assert.equal((await client(db).call("GET", "/api/me")).status, 401);
  const patch = p => c.call("PATCH", "/api/me", { profile: p });
  for (const bad of [{ goal: "x" }, { level: 5 }, { days: 1 }, { minutes: 20 }, { age: 10 }, { height: 300 }, { weight: 10 }, { limits: ["head"] }, { limits: "knees" }])
    assert.equal((await patch(bad)).status, 400, JSON.stringify(bad));
  const ok = await patch({ goal: "muscle", level: 2, days: 4, minutes: 45, place: "gym", limits: ["knees", "knees", "back"], sex: "f", age: 31, height: 168.5, weight: "62,5" });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.profile, { goal: "muscle", level: 2, days: 4, minutes: 45, place: "gym", limits: ["knees", "back"], sex: "f", age: 31, height: 168.5, weight: 62.5 });
  assert.equal((await patch({ weight: null })).body.profile.weight, null);
  assert.equal((await c.call("PATCH", "/api/me", { name: "Я" })).status, 400);
  assert.equal((await c.call("PATCH", "/api/me", { ratingOptIn: "да" })).status, 400);
  assert.equal((await c.call("PATCH", "/api/me", { name: "Новое имя", ratingOptIn: true })).body.user.name, "Новое имя");
});

dbtest("вес и рост: проверки, замена за день, порядок, чужие замеры недоступны", async () => {
  const c = await newUser(db, 30), other = await newUser(db, 31);
  const add = (k, v, d) => c.call("POST", "/api/measurements", { kind: k, value: v, day: d });
  assert.equal((await add("weight", 10)).status, 400);
  assert.equal((await add("weight", 80, "2024-01-01")).status, 400);
  assert.equal((await add("weight", 80, "2026-12-30")).status, 400);
  assert.equal((await add("height", 250)).status, 400);
  assert.equal((await add("mass", 80)).status, 400);
  await add("weight", 82.5, "2026-10-20"); await add("weight", 81, "2026-10-27"); await add("weight", 80.2, "2026-11-02"); await add("height", 175);
  const r = await add("weight", 80.4, "2026-11-02"); // тот же день: заменяется
  assert.equal(r.status, 201);
  const list = (await c.call("GET", "/api/measurements?kind=weight")).body.items;
  assert.deepEqual(list.map(x => [x.day, x.value]), [["2026-10-20", 82.5], ["2026-10-27", 81], ["2026-11-02", 80.4]]);
  const prof = (await c.call("GET", "/api/me")).body.profile;
  assert.equal(prof.weight, 80.4); assert.equal(prof.height, 175);
  assert.equal((await other.call("DELETE", "/api/measurements/" + list[0].id)).status, 404);
  assert.equal((await c.call("DELETE", "/api/measurements/" + list[0].id)).status, 200);
  assert.equal((await c.call("GET", "/api/measurements?kind=weight")).body.items.length, 2);
  assert.equal((await other.call("GET", "/api/measurements")).body.items.length, 0);
});

dbtest("тренировки: очки, бонусы за серию, повтор в тот же день, окно дат, растяжка", async () => {
  const c = await newUser(db, 40, { now: "2026-11-03T08:00:00Z" });
  const w = (day, program) => c.call("POST", "/api/workouts", { day, program: program || "plan", dayId: "w1", title: "День 1" });
  c.setNow("2026-11-03T08:00:00Z");
  const a = await w("2026-11-03");
  assert.deepEqual([a.status, a.body.points, a.body.bonus, a.body.streak], [201, 20, 0, 1]);
  assert.equal((await w("2026-11-03")).status, 409);
  assert.equal((await w("2026-10-30")).status, 400);
  assert.equal((await w("2026-13-45")).status, 400);
  assert.equal((await c.call("POST", "/api/workouts", { day: "2026-11-03", program: "Плохой Код!", dayId: "w1" })).status, 400);
  c.setNow("2026-11-04T08:00:00Z");
  const b = await w("2026-11-04", "stretch");
  assert.deepEqual([b.body.points, b.body.bonus, b.body.streak], [10, 0, 2]);
  c.setNow("2026-11-05T08:00:00Z");
  const t = await w("2026-11-05");
  assert.deepEqual([t.body.points, t.body.bonus, t.body.streak, t.body.total], [20, 5, 3, 25]);
  const me = (await c.call("GET", "/api/me")).body;
  assert.deepEqual(me.stats, { points: 20 + 10 + 25, workouts: 3, streak: 3 });
  c.setNow("2026-11-12T08:00:00Z");
  assert.equal((await c.call("GET", "/api/me")).body.stats.streak, 0); // серия сгорела
  const after = await w("2026-11-12");
  assert.deepEqual([after.body.bonus, after.body.streak], [0, 1]);
  assert.equal((await c.call("GET", "/api/workouts")).body.items.length, 4);
});

dbtest("перенос истории: старые дни добавляются по порядку, повторы и неверное пропускаются", async () => {
  const c = await newUser(db, 50, { now: "2026-11-20T08:00:00Z" });
  const items = [
    { day: "2026-11-18", program: "plan", dayId: "w1" }, { day: "2026-11-16", program: "start", dayId: "d1" }, { day: "2026-11-17", program: "start", dayId: "d2" },
    { day: "2026-11-17", program: "start", dayId: "d2" },         // повтор
    { day: "2026-09-01", program: "start", dayId: "d1" },         // старше 30 дней
    { day: "плохо", program: "start", dayId: "d1" }, null, 5,
  ];
  const r = await c.call("POST", "/api/workouts/sync", { items });
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.added, r.body.points], [3, 20 + 20 + 25]); // 16-го 20, 17-го 20, 18-го серия 3 → 20 + 5
  assert.equal((await c.call("POST", "/api/workouts/sync", { items })).body.added, 0);
  assert.equal((await c.call("POST", "/api/workouts/sync", { items: "x" })).status, 400);
  assert.equal((await c.call("POST", "/api/workouts/sync", { items: new Array(61).fill({}) })).status, 400);
});

dbtest("рейтинг: только согласившиеся, порядок, периоды, свой результат вне двадцатки", async () => {
  const day1 = "2026-12-07", T = "2026-12-07T09:00:00Z"; // понедельник
  const users = [];
  for (let i = 0; i < 24; i++) users.push(await newUser(db, 100 + i, { now: T }));
  for (let i = 0; i < 24; i++) {
    const u = users[i]; u.setNow(T);
    await u.call("PATCH", "/api/me", { ratingOptIn: i !== 5 }); // 5-й не участвует
    if (i < 23) await u.call("POST", "/api/workouts", { day: day1, program: "plan", dayId: "w1" });
  }
  // у игрока 3 добавим тренировки: итого 3 за неделю
  const star = users[3];
  star.setNow("2026-12-08T09:00:00Z"); await star.call("POST", "/api/workouts", { day: "2026-12-08", program: "plan", dayId: "w2" });
  star.setNow("2026-12-09T09:00:00Z"); await star.call("POST", "/api/workouts", { day: "2026-12-09", program: "plan", dayId: "w3" });
  const last = users[23]; last.setNow("2026-12-09T09:00:00Z"); // 23-й без тренировок, участвует
  const viewer = users[0]; viewer.setNow("2026-12-09T09:00:00Z");
  const lb = (await viewer.call("GET", "/api/leaderboard?period=week")).body;
  assert.equal(lb.items[0].name, "Игрок103");
  assert.equal(lb.items[0].points, 20 + 20 + 25); assert.equal(lb.items[0].rank, 1);
  assert.ok(!lb.items.some(x => x.name === "Игрок105"), "не согласившийся виден в рейтинге");
  assert.ok(lb.items.filter(x => x.me).length === 1 && lb.items.find(x => x.me).name === "Игрок100");
  // пользователь без тренировок вне первой двадцатки: его строка добавляется отдельно
  const lastView = (await last.call("GET", "/api/leaderboard?period=all")).body;
  assert.equal(lastView.items.at(-1).name, "Игрок123"); assert.equal(lastView.items.at(-1).me, true); assert.equal(lastView.items.at(-1).points, 0);
  assert.ok(lastView.items.length <= 21);
  const anon = (await client(db, T).call("GET", "/api/leaderboard?period=month")).body;
  assert.ok(anon.items.length >= 20 && anon.items.every(x => !x.me));
  assert.equal((await viewer.call("GET", "/api/leaderboard?period=year")).status, 400);
  // периоды: неделя начинается в понедельник
  const A2 = require("../api/_lib/app");
  assert.equal(A2.periodStart("week", require("../api/_lib/validate").dayNum("2026-12-09")), "2026-12-07");
  assert.equal(A2.periodStart("week", require("../api/_lib/validate").dayNum("2026-12-06")), "2026-11-30"); // воскресенье
  assert.equal(A2.periodStart("month", require("../api/_lib/validate").dayNum("2026-12-20")), "2026-12-01");
  assert.equal(A2.periodStart("all", 1), null);
});

dbtest("удаление аккаунта: нужен пароль, данные удаляются каскадом, вход больше невозможен", async () => {
  const c = await newUser(db, 60);
  await c.call("POST", "/api/measurements", { kind: "weight", value: 70 });
  await c.call("POST", "/api/workouts", { day: "2026-11-02", program: "plan", dayId: "w1" });
  assert.equal((await c.call("DELETE", "/api/me", { password: "неверный" })).status, 403);
  assert.equal((await c.call("DELETE", "/api/me", { password: "password60" })).status, 200);
  const left = async t => Number((await db.query(`SELECT count(*)::int AS n FROM ${t} WHERE user_id = (SELECT id FROM users WHERE email = 'u60@test.kz')`))[0]?.n || 0);
  assert.equal((await db.query("SELECT 1 FROM users WHERE email = 'u60@test.kz'")).length, 0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM workouts w LEFT JOIN users u ON u.id = w.user_id WHERE u.id IS NULL"))[0].n, 0);
  assert.equal((await c.call("GET", "/api/me")).status, 401);
  assert.equal((await client(db).call("POST", "/api/auth/login", { email: "u60@test.kz", password: "password60" })).status, 401);
});

dbtest("маршруты: неизвестный адрес, неверный метод, база не подключена", async () => {
  const c = client(db);
  assert.equal((await c.call("GET", "/api/nope")).status, 404);
  assert.equal((await c.call("GET", "/api/auth/login")).status, 405);
  const saved = { a: process.env.DATABASE_URL, b: process.env.POSTGRES_URL };
  delete process.env.DATABASE_URL; delete process.env.POSTGRES_URL;
  const r = await handle({ method: "GET", path: "/api/health", headers: {}, query: {} });
  assert.equal(r.status, 503);
  if (saved.a) process.env.DATABASE_URL = saved.a; if (saved.b) process.env.POSTGRES_URL = saved.b;
});

test("точка входа Vercel: путь собирается из __p, лишний параметр не попадает в запрос", () => {
  const entry = require("../api/index.js");
  assert.deepEqual(entry.pathOf({ url: "/api/index?__p=auth%2Fregister", query: { __p: "auth/register" } }), { path: "/api/auth/register", query: {} });
  assert.deepEqual(entry.pathOf({ url: "/x", query: { __p: ["workouts", "sync"], period: "week" } }), { path: "/api/workouts/sync", query: { period: "week" } });
  assert.deepEqual(entry.pathOf({ url: "/api/leaderboard?period=all", query: {} }).path, "/api/leaderboard"); // без перенаправления
  assert.equal(entry.pathOf({ url: "/api/", query: { __p: "" } }).path, "/api/");
});

dbtest("точка входа Vercel обрабатывает вложенный адрес и отдаёт cookie", async () => {
  const { setDb } = require("../api/_lib/db");
  setDb(db);
  const entry = require("../api/index.js");
  const sent = {};
  const res = { setHeader: (k, v) => { sent[k] = v; }, status(c) { sent.status = c; return this; }, json(b) { sent.body = b; } };
  await entry({ method: "POST", url: "/api/index?__p=auth%2Fregister", query: { __p: "auth/register" }, headers: { host: "x.test", "x-fw": "1", "x-forwarded-for": "5.5.5.5" },
    body: { email: "entry@test.kz", password: "password-entry", name: "Вход" } }, res);
  assert.equal(sent.status, 201);
  assert.match(String(sent["Set-Cookie"]), /fw_session=/);
  assert.equal(sent["Cache-Control"], "no-store");
  setDb(null);
});
