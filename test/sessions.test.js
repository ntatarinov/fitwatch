// Тренировки с подходами: проверка ввода, расчёт тоннажа на сервере, повторная отправка, чужие данные, показ тренеру по согласию.
const test = require("node:test"), assert = require("node:assert/strict");
const { makeDb, client, newUser, makeAdmin } = require("./api.helpers");

let db;
test.before(async () => { db = await makeDb(); });
test.after(async () => { if (db) await db.close(); });
const dbtest = (name, fn) => test(name, async t => { if (!db) return t.skip("нет @electric-sql/pglite"); await fn(t); });
const uuid = n => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const item = (ex, name, ...sets) => ({ ex, name, sets: sets.map(([reps, kg]) => ({ reps, kg })) });
const body = (id, extra) => Object.assign({ id: uuid(id), title: "Грудь", durationSec: 3300, day: "2026-11-02", items: [item("bench", "Жим лёжа", [8, 60], [8, 60], [6, 62.5])] }, extra || {});

dbtest("запись: тоннаж и подходы считает сервер, присланным числам не верит", async () => {
  const c = await newUser(db, 4000);
  const r = await c.call("POST", "/api/sessions", body(1, { tonnage: 999999, sets: 999 }));
  assert.equal(r.status, 201);
  assert.deepEqual([r.body.sets, r.body.tonnage], [3, 8 * 60 + 8 * 60 + 6 * 62.5]);
  const list = (await c.call("GET", "/api/sessions")).body.items;
  assert.deepEqual([list.length, list[0].tonnage, list[0].sets, list[0].durationSec, list[0].date, list[0].title], [1, 1335, 3, 3300, "2026-11-02", "Грудь"]);
  assert.deepEqual(list[0].items[0].sets[2], { reps: 6, kg: 62.5 });
  assert.equal(list[0].items[0].name, "Жим лёжа");
});

dbtest("повторная отправка той же тренировки безопасна; чужой идентификатор не раскрывается; лимит в день", async () => {
  const a = await newUser(db, 4010), b = await newUser(db, 4011);
  assert.equal((await a.call("POST", "/api/sessions", body(10))).status, 201);
  const again = await a.call("POST", "/api/sessions", body(10, { title: "Другое название" }));
  assert.deepEqual([again.status, again.body.already], [200, true]);
  assert.equal((await a.call("GET", "/api/sessions")).body.items.length, 1, "дубля нет");
  assert.equal((await a.call("GET", "/api/sessions")).body.items[0].title, "Грудь", "повтор ничего не перезаписал");
  assert.equal((await b.call("POST", "/api/sessions", body(10))).status, 409, "чужой id занят");
  assert.equal((await b.call("GET", "/api/sessions")).body.items.length, 0, "чужие тренировки не видны");
  for (let i = 0; i < 9; i++) assert.equal((await a.call("POST", "/api/sessions", body(20 + i))).status, 201);
  assert.equal((await a.call("POST", "/api/sessions", body(99))).status, 429, "11-я тренировка за день");
});

dbtest("проверка ввода: границы, типы, пустое и вредное — 400, а не 500", async () => {
  const c = await newUser(db, 4020);
  const bad = async (what, extra, status) => { const r = await c.call("POST", "/api/sessions", Object.assign(body(300 + Math.floor(Math.random() * 1e6)), extra)); assert.equal(r.status, status || 400, what + ": " + r.status + " " + JSON.stringify(r.body)); };
  await bad("без id", { id: undefined });
  await bad("id не uuid", { id: "abc" });
  await bad("пустое название", { title: "  " });
  await bad("название 81", { title: "я".repeat(81) });
  await bad("длительность отрицательная", { durationSec: -1 });
  await bad("длительность 25 часов", { durationSec: 90000 });
  await bad("длительность дробная", { durationSec: 1.5 });
  await bad("нет упражнений", { items: [] });
  await bad("21 упражнение", { items: Array.from({ length: 21 }, (_, i) => item("ex" + i, "У" + i, [5, 10])) });
  await bad("упражнение не объект", { items: [5] });
  await bad("код упражнения с пробелом", { items: [item("a b", "Жим", [5, 10])] });
  await bad("пустое имя упражнения", { items: [item("bench", "", [5, 10])] });
  await bad("нет подходов", { items: [{ ex: "bench", name: "Жим", sets: [] }] });
  await bad("31 подход", { items: [item("bench", "Жим", ...Array(31).fill([5, 10]))] });
  await bad("повторения 0", { items: [item("bench", "Жим", [0, 10])] });
  await bad("повторения 1001", { items: [item("bench", "Жим", [1001, 10])] });
  await bad("повторения дробные", { items: [item("bench", "Жим", [5.5, 10])] });
  await bad("вес отрицательный", { items: [item("bench", "Жим", [5, -1])] });
  await bad("вес 1001", { items: [item("bench", "Жим", [5, 1001])] });
  await bad("вес NaN-строка", { items: [item("bench", "Жим", [5, "много"])] });
  await bad("подход — null", { items: [{ ex: "bench", name: "Жим", sets: [null] }] });
  await bad("нулевой символ в названии", { title: "Гр\u0000удь" });
  await bad("больше 200 подходов", { items: Array.from({ length: 8 }, (_, i) => item("e" + i, "У" + i, ...Array(30).fill([5, 10]))) });
  await bad("дата давно", { day: "2026-10-01" });
  await bad("дата в будущем", { day: "2026-11-10" });
  await bad("дата не дата", { day: "вчера" });
  await bad("программа с пробелом", { program: "a b" });
  const ok = await c.call("POST", "/api/sessions", body(4021, { items: [item("pushup", "Отжимания", [15, 0], [12, "0"], [10, ""])], program: "start", dayId: "d1", startedAt: "2026-11-02T09:00:00Z" }));
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.deepEqual([ok.body.sets, ok.body.tonnage], [3, 0], "своё тело: вес 0, подходы считаются");
  assert.equal((await client(db).call("POST", "/api/sessions", body(4022))).status, 401);
  assert.equal((await c.call("POST", "/api/sessions", body(4023), { "x-fw": null })).status, 403, "без защитного заголовка");
});

dbtest("удаление своей тренировки; чужую не удалить; неверный адрес", async () => {
  const a = await newUser(db, 4030), b = await newUser(db, 4031);
  await a.call("POST", "/api/sessions", body(40));
  assert.equal((await b.call("DELETE", "/api/sessions/" + uuid(40))).status, 404);
  assert.equal((await a.call("DELETE", "/api/sessions/------------------------------------")).status, 404);
  assert.equal((await a.call("DELETE", "/api/sessions/" + uuid(40))).status, 200);
  assert.equal((await a.call("GET", "/api/sessions")).body.items.length, 0);
  assert.equal((await a.call("GET", "/api/sessions?limit=0")).status, 400);
  assert.equal((await a.call("GET", "/api/sessions?limit=abc")).status, 400);
});

dbtest("тренер видит подробности тренировок клиента только при согласии на результаты", async () => {
  const boss = await newUser(db, 4040);
  await makeAdmin(db, "u4040@test.kz");
  await boss.call("POST", "/api/admin/promo", { tier: "personal", days: 30, maxUses: 5, code: "SES-PERS" });
  const t = await newUser(db, 4041), c = await newUser(db, 4042);
  const tid = (await db.query("SELECT id FROM users WHERE email = 'u4041@test.kz'"))[0].id;
  await boss.call("POST", "/api/admin/users/" + tid + "/role", { role: "trainer", on: true });
  await c.call("POST", "/api/subscription/redeem", { code: "SES-PERS" });
  const link = (await c.call("POST", "/api/trainers/" + tid + "/request", {})).body.id;
  await t.call("POST", "/api/links/" + link + "/accept", {});
  await c.call("POST", "/api/sessions", body(50));
  await c.call("POST", "/api/sessions", body(51, { items: [item("squat", "Приседания", [5, 100], [5, 100])], title: "Ноги", durationSec: 1800 }));
  const closed = await t.call("GET", "/api/coach/clients/" + link);
  assert.equal(closed.body.series, null);
  assert.ok(!JSON.stringify(closed.body).includes("Жим лёжа") && !JSON.stringify(closed.body).includes("Приседания"), "без согласия подробностей нет");
  await c.call("PATCH", "/api/links/" + link + "/share", { results: true });
  const open = (await t.call("GET", "/api/coach/clients/" + link)).body;
  assert.equal(open.series.sessions.length, 2);
  assert.deepEqual(open.series.sessions.map(s => s.title).sort(), ["Грудь", "Ноги"]);
  assert.deepEqual(open.stats.sessions28, { count: 2, tonnage: 1335 + 1000, minutes: 55 + 30, sets: 5 });
  assert.deepEqual(open.series.sessions.find(s => s.title === "Ноги").items[0].sets, [{ reps: 5, kg: 100 }, { reps: 5, kg: 100 }]);
  await c.call("PATCH", "/api/links/" + link + "/share", { results: false });
  assert.equal((await t.call("GET", "/api/coach/clients/" + link)).body.series, null, "отозвал доступ — подробностей нет");
  // другой тренер и клиент без связи
  const other = await newUser(db, 4043);
  await boss.call("POST", "/api/admin/users/" + (await db.query("SELECT id FROM users WHERE email = 'u4043@test.kz'"))[0].id + "/role", { role: "trainer", on: true });
  assert.equal((await other.call("GET", "/api/coach/clients/" + link)).status, 404);
  // удаление аккаунта убирает тренировки
  const cid = (await db.query("SELECT id FROM users WHERE email = 'u4042@test.kz'"))[0].id;
  assert.equal((await db.query("SELECT count(*)::int AS n FROM workout_sessions WHERE user_id = $1", [cid]))[0].n, 2);
  assert.equal((await c.call("DELETE", "/api/me", { password: "password4042" })).status, 200);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM workout_sessions WHERE user_id = $1", [cid]))[0].n, 0);
});
