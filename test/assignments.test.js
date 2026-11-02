// Тренировки, назначенные тренером: права, проверка ввода, видимость, выполнение; а также оценка тяжести тренировки (RPE).
const test = require("node:test"), assert = require("node:assert/strict");
const { makeDb, newUser, makeAdmin } = require("./api.helpers");

let db;
test.before(async () => { db = await makeDb(); });
test.after(async () => { if (db) await db.close(); });
const dbtest = (name, fn) => test(name, async t => { if (!db) return t.skip("нет @electric-sql/pglite"); await fn(t); });
const idOf = async n => (await db.query("SELECT id FROM users WHERE email = $1", ["u" + n + "@test.kz"]))[0].id;
const plan = (extra) => Object.assign({ title: "Грудь и трицепс", note: "Отдых между подходами 90 секунд", items: [{ ex: "db_bench", name: "Жим гантелей лёжа", sets: 4, reps: "8–10" }, { ex: "pushup", name: "Отжимания", sets: 3, reps: "10" }] }, extra || {});

async function setup(n) {
  const boss = await newUser(db, n);
  await makeAdmin(db, "u" + n + "@test.kz");
  await boss.call("POST", "/api/admin/promo", { tier: "personal", days: 30, maxUses: 9, code: "ASG-" + n });
  const t = await newUser(db, n + 1), c = await newUser(db, n + 2);
  await boss.call("POST", "/api/admin/users/" + (await idOf(n + 1)) + "/role", { role: "trainer", on: true });
  await c.call("POST", "/api/subscription/redeem", { code: "ASG-" + n });
  const link = (await c.call("POST", "/api/trainers/" + (await idOf(n + 1)) + "/request", {})).body.id;
  await t.call("POST", "/api/links/" + link + "/accept", {});
  return { boss, t, c, link };
}

dbtest("тренер назначает клиенту тренировку, клиент видит её, выполняет один раз", async () => {
  const { t, c, link } = await setup(5000);
  const r = await t.call("POST", "/api/coach/clients/" + link + "/assignments", plan());
  assert.equal(r.status, 201);
  const mine = (await c.call("GET", "/api/assignments")).body.items;
  assert.equal(mine.length, 1);
  assert.deepEqual([mine[0].title, mine[0].status, mine[0].items.length, mine[0].items[0].reps, mine[0].note], ["Грудь и трицепс", "new", 2, "8–10", "Отдых между подходами 90 секунд"]);
  assert.ok(mine[0].trainer, "видно имя тренера");
  const sid = "00000000-0000-4000-8000-000000000777";
  assert.equal((await c.call("POST", "/api/assignments/" + r.body.id + "/done", { sessionId: sid })).status, 200);
  assert.equal((await c.call("POST", "/api/assignments/" + r.body.id + "/done", {})).status, 404, "второй раз нельзя");
  assert.equal((await c.call("GET", "/api/assignments")).body.items[0].status, "done");
  const list = (await t.call("GET", "/api/coach/clients/" + link + "/assignments")).body.items;
  assert.deepEqual([list.length, list[0].status], [1, "done"], "тренер видит, что выполнено");
});

dbtest("права: клиент не назначает, чужой тренер и чужой клиент не видят и не трогают", async () => {
  const { boss, t, c, link } = await setup(5010);
  assert.equal((await c.call("POST", "/api/coach/clients/" + link + "/assignments", plan())).status, 403, "клиент не тренер");
  const other = await newUser(db, 5013);
  await boss.call("POST", "/api/admin/users/" + (await idOf(5013)) + "/role", { role: "trainer", on: true });
  assert.equal((await other.call("POST", "/api/coach/clients/" + link + "/assignments", plan())).status, 404, "чужой тренер");
  const id = (await t.call("POST", "/api/coach/clients/" + link + "/assignments", plan())).body.id;
  assert.equal((await other.call("GET", "/api/coach/clients/" + link + "/assignments")).status, 404);
  assert.equal((await other.call("DELETE", "/api/coach/clients/" + link + "/assignments/" + id)).status, 404);
  const stranger = await newUser(db, 5014);
  assert.equal((await stranger.call("GET", "/api/assignments")).body.items.length, 0, "чужой клиент ничего не видит");
  assert.equal((await stranger.call("POST", "/api/assignments/" + id + "/done", {})).status, 404, "чужое задание не выполнить");
  assert.equal((await new (require("./api.helpers").client)(db).call("GET", "/api/assignments")).status, 401, "без входа нельзя");
});

dbtest("тренер отменяет невыполненное; после окончания связи клиент задание не видит и новое не назначить", async () => {
  const { t, c, link } = await setup(5020);
  const id = (await t.call("POST", "/api/coach/clients/" + link + "/assignments", plan())).body.id;
  assert.equal((await t.call("DELETE", "/api/coach/clients/" + link + "/assignments/" + id)).status, 200);
  assert.equal((await c.call("GET", "/api/assignments")).body.items.length, 0, "отменённое клиент не видит");
  const id2 = (await t.call("POST", "/api/coach/clients/" + link + "/assignments", plan({ title: "Ноги" }))).body.id;
  assert.equal((await c.call("GET", "/api/assignments")).body.items.length, 1);
  await db.query("UPDATE trainer_links SET status = 'ended' WHERE id = $1", [link]);
  assert.equal((await c.call("GET", "/api/assignments")).body.items.length, 0, "связь закончилась — задания не видны");
  assert.equal((await t.call("POST", "/api/coach/clients/" + link + "/assignments", plan())).status, 409, "новое назначить нельзя");
  assert.ok(id2);
});

dbtest("проверка ввода назначения: границы и типы — 400", async () => {
  const { t, link } = await setup(5030);
  const bad = async (what, extra) => assert.equal((await t.call("POST", "/api/coach/clients/" + link + "/assignments", plan(extra))).status, 400, what);
  await bad("пустое название", { title: " " });
  await bad("название 81", { title: "я".repeat(81) });
  await bad("заметка 501", { note: "я".repeat(501) });
  await bad("нет упражнений", { items: [] });
  await bad("13 упражнений", { items: Array.from({ length: 13 }, (_, i) => ({ ex: "e" + i, name: "У" + i, sets: 3, reps: "10" })) });
  await bad("упражнение не объект", { items: [5] });
  await bad("0 подходов", { items: [{ ex: "a", name: "A", sets: 0, reps: "10" }] });
  await bad("11 подходов", { items: [{ ex: "a", name: "A", sets: 11, reps: "10" }] });
  await bad("дробные подходы", { items: [{ ex: "a", name: "A", sets: 2.5, reps: "10" }] });
  await bad("код с пробелом", { items: [{ ex: "a b", name: "A", sets: 3, reps: "10" }] });
  await bad("повторения 13 символов", { items: [{ ex: "a", name: "A", sets: 3, reps: "1234567890123" }] });
  await bad("нет повторений", { items: [{ ex: "a", name: "A", sets: 3 }] });
  assert.equal((await t.call("POST", "/api/coach/clients/" + link + "/assignments", plan({ note: undefined, items: [{ ex: "a", name: "A", sets: 3, reps: 12 }] }))).status, 201, "число вместо строки в повторениях допустимо, заметка необязательна");
});

dbtest("оценка тяжести тренировки (1–10): сохраняется, необязательна, вне границ — 400, тренер её видит при согласии", async () => {
  const { t, c, link } = await setup(5040);
  const base = n => ({ id: "00000000-0000-4000-8000-" + String(n).padStart(12, "0"), title: "Грудь", durationSec: 1800, items: [{ ex: "bench", name: "Жим", sets: [{ reps: 8, kg: 60 }] }] });
  assert.equal((await c.call("POST", "/api/sessions", Object.assign(base(1), { rpe: 8 }))).status, 201);
  assert.equal((await c.call("POST", "/api/sessions", base(2))).status, 201, "без оценки можно");
  for (const [n, v] of [[3, 0], [4, 11], [5, 7.5], [6, "тяжело"]]) assert.equal((await c.call("POST", "/api/sessions", Object.assign(base(n), { rpe: v }))).status, 400, "rpe " + v);
  const list = (await c.call("GET", "/api/sessions")).body.items;
  assert.deepEqual(list.map(s => s.rpe).sort(), [8, null]);
  await c.call("PATCH", "/api/links/" + link + "/share", { results: true });
  const open = (await t.call("GET", "/api/coach/clients/" + link)).body;
  assert.ok(open.series.sessions.some(s => s.rpe === 8));
});
