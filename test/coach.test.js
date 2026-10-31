// Кабинет тренера: сводка по клиентам, дашборд клиента, заметки. Проверяется на настоящей базе Postgres в памяти (PGlite).
const test = require("node:test"), assert = require("node:assert/strict");
process.env.ADMIN_EMAILS = "u900@test.kz";
const { makeDb, client, newUser, makeAdmin } = require("./api.helpers");

let db;
test.before(async () => { db = await makeDb(); });
test.after(async () => { if (db) await db.close(); });
const dbtest = (name, fn) => test(name, async t => { if (!db) return t.skip("нет @electric-sql/pglite"); await fn(t); });

const TODAY = Date.UTC(2026, 10, 2) / 86400000;            // 2026-11-02: «сегодня» в клиенте тестов
const dayStr = n => new Date(n * 86400000).toISOString().slice(0, 10);
const uid = async n => (await db.query("SELECT id FROM users WHERE email = $1", ["u" + n + "@test.kz"]))[0].id;
const addWorkout = (userId, ago, title, pts) => db.query("INSERT INTO workouts(user_id, day, program, day_id, title, base_points, bonus_points) VALUES ($1, $2::date, 'plan', 'w1', $3, $4, 0)", [userId, dayStr(TODAY - ago), title || "День", pts || 20]);
const addWeight = (userId, ago, v) => db.query("INSERT INTO measurements(user_id, kind, value, measured_on) VALUES ($1, 'weight', $2, $3::date)", [userId, v, dayStr(TODAY - ago)]);

let world;
async function build() {
  if (world) return world;
  const admin = client(db); admin.setIp("10.9.7.1");
  await admin.call("POST", "/api/auth/register", { email: "u900@test.kz", password: "password900", name: "Админ" }).catch(() => {});
  await admin.call("POST", "/api/auth/login", { email: "u900@test.kz", password: "password900" });
  await makeAdmin(db, "u900@test.kz");
  await admin.call("POST", "/api/admin/promo", { tier: "personal", days: 60, maxUses: 50, code: "COACH-ALL" });
  const mkTrainer = async n => {
    const t = await newUser(db, n);
    await t.call("POST", "/api/trainer/apply", { bio: "Тренер по силовым, 8 лет опыта, работаю с новичками.", specialties: "сила" });
    const id = (await admin.call("GET", "/api/admin/trainers?status=pending")).body.items.find(x => x.name === "Игрок" + n).id;
    await admin.call("POST", "/api/admin/trainers/" + id + "/approve", {});
    return { t, id };
  };
  const T = await mkTrainer(1000), T2 = await mkTrainer(1001);
  const pending = await newUser(db, 1002); // подал заявку, но не подтверждён
  await pending.call("POST", "/api/trainer/apply", { bio: "Ещё не подтверждённый тренер, описание достаточно длинное.", specialties: "" });
  const clients = {};
  for (const n of [1010, 1011, 1012, 1013, 1014, 1015]) {
    const c = await newUser(db, n);
    await c.call("POST", "/api/subscription/redeem", { code: "COACH-ALL" });
    const r = await c.call("POST", "/api/trainers/" + T.id + "/request", { note: "Хочу сильнее, колени болят" + n });
    assert.equal(r.status, 201, "запрос " + n + ": " + JSON.stringify(r.body));
    clients[n] = c;
  }
  const links = (await T.t.call("GET", "/api/links")).body.items;
  const linkOf = n => links.find(l => l.with.name === "Игрок" + n).id;
  const L = {}; for (const n of [1010, 1011, 1012, 1013, 1014, 1015]) L[n] = linkOf(n);
  for (const n of [1010, 1011, 1012, 1013, 1015]) await T.t.call("POST", "/api/links/" + L[n] + "/accept", {});
  await T.t.call("POST", "/api/links/" + L[1015] + "/end", {});            // 1014 так и остался запросом, 1015 завершён
  await clients[1010].call("PATCH", "/api/links/" + L[1010] + "/share", { goals: true, results: true });
  await clients[1011].call("PATCH", "/api/links/" + L[1011] + "/share", { results: true });
  await clients[1012].call("PATCH", "/api/links/" + L[1012] + "/share", { goals: true });
  // 1013: ничего не открыл

  const id = {}; for (const n of [1010, 1011, 1012, 1013]) id[n] = await uid(n);
  await db.query("INSERT INTO profiles(user_id, goal, level, days, minutes, place, limits) VALUES ($1,'muscle',2,3,45,'gym','{knees}'), ($2,'lose',1,4,30,'home','{}') ON CONFLICT (user_id) DO UPDATE SET goal = EXCLUDED.goal, level = EXCLUDED.level, days = EXCLUDED.days, minutes = EXCLUDED.minutes, place = EXCLUDED.place, limits = EXCLUDED.limits", [id[1010], id[1012]]);
  for (const ago of [0, 2, 4, 10, 17, 30]) await addWorkout(id[1010], ago, "Грудь и спина", 20);
  await addWeight(id[1010], 40, 82); await addWeight(id[1010], 20, 80); await addWeight(id[1010], 1, 78.5);
  await addWorkout(id[1011], 9, "Ноги", 20);
  await addWorkout(id[1012], 1, "СЕКРЕТНАЯ-тренировка-1012", 20);
  await addWorkout(id[1013], 1, "СЕКРЕТНАЯ-тренировка-1013", 20);
  await addWeight(id[1013], 1, 123.4);
  await clients[1010].call("POST", "/api/links/" + L[1010] + "/messages", { body: "Тренер, можно ли заменить присед?" });
  await T.t.call("POST", "/api/links/" + L[1011] + "/messages", { body: "Как самочувствие?" });
  world = { admin, T, T2, pending, clients, L, id };
  return world;
}
const byLink = (o, linkId) => o.body.clients.find(c => c.linkId === linkId);

dbtest("доступ: только подтверждённый тренер; чужих клиентов не видно", async () => {
  const { T, T2, pending, clients, L } = await build();
  assert.equal((await client(db).call("GET", "/api/coach/overview")).status, 401);
  assert.equal((await clients[1010].call("GET", "/api/coach/overview")).status, 403, "клиент не тренер");
  assert.equal((await pending.call("GET", "/api/coach/overview")).status, 403, "неподтверждённый не получает кабинет");
  assert.equal((await T.t.call("GET", "/api/coach/overview")).status, 200);
  const other = await T2.t.call("GET", "/api/coach/overview");
  assert.equal(other.status, 200);
  assert.deepEqual(other.body.clients, [], "у другого тренера клиентов нет");
  assert.equal((await T2.t.call("GET", "/api/coach/clients/" + L[1010])).status, 404, "чужая связь не раскрывается");
  assert.equal((await T2.t.call("PATCH", "/api/coach/clients/" + L[1010] + "/note", { note: "x" })).status, 404);
  assert.equal((await clients[1010].call("GET", "/api/coach/clients/" + L[1010])).status, 403);
  assert.equal((await T.t.call("GET", "/api/coach/clients/999999")).status, 404);
  assert.equal((await T.t.call("GET", "/api/coach/clients/abc")).status, 404);
  assert.equal((await T.t.call("GET", "/api/me")).body.user.isTrainer, true);
  assert.equal((await clients[1010].call("GET", "/api/me")).body.user.isTrainer, false);
  assert.equal((await pending.call("GET", "/api/me")).body.user.isTrainer, false);
});

dbtest("сводка: итоги по клиентам, регулярность, недели, флаги внимания", async () => {
  const { T, L } = await build();
  const r = await T.t.call("GET", "/api/coach/overview");
  const t = r.body.totals;
  assert.deepEqual([t.active, t.requested, t.ended, t.withResults, t.hiddenResults], [4, 1, 1, 2, 2]);
  assert.deepEqual([t.activeThisWeek, t.avgAdherence, t.needAttention, t.workouts7], [1, 100, 2, 3]);
  assert.deepEqual(r.body.team.weekly, [0, 0, 0, 1, 0, 1, 2, 3], "клиенты по неделям: 8 недель, последняя — текущая");
  assert.equal(r.body.team.weekStarts.length, 8);
  assert.equal(r.body.team.weekStarts[7], dayStr(TODAY - 6));

  const a = byLink(r, L[1010]);
  assert.deepEqual([a.stats.workouts7, a.stats.workouts28, a.stats.points28, a.stats.adherence, a.stats.daysSince, a.stats.lastWorkout], [3, 5, 100, 100, 0, dayStr(TODAY)]);
  assert.deepEqual(a.stats.weekly, [0, 0, 0, 1, 0, 1, 1, 3]);
  assert.deepEqual([a.stats.weightNow, a.stats.weightDelta], [78.5, -3.5]);
  assert.deepEqual([a.goal, a.targetDays, a.flags], ["muscle", 3, ["reply"]], "клиент написал последним: ждёт ответа");
  assert.equal(a.request, "Хочу сильнее, колени болят1010");

  const b = byLink(r, L[1011]);
  assert.deepEqual([b.stats.workouts7, b.stats.daysSince, b.stats.adherence, b.targetDays, b.goal], [0, 9, null, null, null], "цели не открыты: регулярность не считается");
  assert.deepEqual(b.flags, ["inactive"], "тренер написал последним, но клиент давно не тренировался");
  assert.equal(byLink(r, L[1014]).status, "requested");
  assert.equal(byLink(r, L[1015]).status, "ended");
  assert.deepEqual(byLink(r, L[1015]).flags, []);
});

dbtest("согласие клиента: без разрешения нет ни цифр, ни целей, ни следов в ответе", async () => {
  const { T, L } = await build();
  const r = await T.t.call("GET", "/api/coach/overview");
  const c = byLink(r, L[1012]), d = byLink(r, L[1013]);
  assert.equal(c.stats, null);
  assert.equal(c.goal, "lose", "цели открыты");
  assert.equal(d.stats, null);
  assert.deepEqual([d.goal, d.targetDays, d.shareGoals, d.shareResults], [null, null, false, false]);
  const text = JSON.stringify(r.body);
  assert.ok(!text.includes("СЕКРЕТНАЯ") && !text.includes("123.4"), "данные клиентов без согласия утекли в сводку");
  const dash = await T.t.call("GET", "/api/coach/clients/" + L[1013]);
  assert.deepEqual([dash.status, dash.body.stats, dash.body.series, dash.body.goals], [200, null, null, null]);
  assert.ok(!JSON.stringify(dash.body).includes("СЕКРЕТНАЯ"));
  const dash2 = await T.t.call("GET", "/api/coach/clients/" + L[1012]);
  assert.ok(dash2.body.goals && dash2.body.goals.goal === "lose" && dash2.body.series === null, "цели есть, результатов нет");
  assert.ok(!JSON.stringify(dash2.body).includes("СЕКРЕТНАЯ"));
});

dbtest("дашборд клиента: недели, вес, последние тренировки, цели", async () => {
  const { T, L } = await build();
  const r = await T.t.call("GET", "/api/coach/clients/" + L[1010]);
  assert.equal(r.status, 200);
  const b = r.body;
  assert.deepEqual([b.client.name, b.client.status, b.shareGoals, b.shareResults], ["Игрок1010", "active", true, true]);
  assert.deepEqual(b.series.weekly, [0, 0, 0, 1, 0, 1, 1, 3]);
  assert.deepEqual(b.series.weeklyPoints, [0, 0, 0, 20, 0, 20, 20, 60]);
  assert.deepEqual(b.series.weight.map(w => w.value), [82, 80, 78.5]);
  assert.equal(b.series.recent.length, 6);
  assert.equal(b.series.recent[0].day, dayStr(TODAY), "последние тренировки: новые сверху");
  assert.deepEqual(b.goals, { goal: "muscle", level: 2, days: 3, minutes: 45, place: "gym", limits: ["knees"] });
  assert.deepEqual(b.flags, ["reply"]);
  assert.equal(b.lastMessage.fromClient, true);
});

dbtest("клиент отозвал доступ: цифры пропадают сразу", async () => {
  const { T, clients, L } = await build();
  await clients[1010].call("PATCH", "/api/links/" + L[1010] + "/share", { results: false });
  const r = await T.t.call("GET", "/api/coach/overview");
  assert.equal(byLink(r, L[1010]).stats, null);
  assert.equal(r.body.totals.withResults, 1);
  assert.equal((await T.t.call("GET", "/api/coach/clients/" + L[1010])).body.series, null);
  await clients[1010].call("PATCH", "/api/links/" + L[1010] + "/share", { results: true });
  assert.ok(byLink(await T.t.call("GET", "/api/coach/overview"), L[1010]).stats);
});

dbtest("заметка тренера: сохраняется, видна только ему, ограничена по длине", async () => {
  const { T, T2, clients, L } = await build();
  const ok = await T.t.call("PATCH", "/api/coach/clients/" + L[1010] + "/note", { note: "  Осторожно с коленом, начать с жима ногами.\r\nСвязаться в пятницу  " });
  assert.deepEqual([ok.status, ok.body.note], [200, "Осторожно с коленом, начать с жима ногами.\nСвязаться в пятницу"]);
  assert.equal(byLink(await T.t.call("GET", "/api/coach/overview"), L[1010]).trainerNote, ok.body.note);
  assert.equal((await T.t.call("GET", "/api/coach/clients/" + L[1010])).body.trainerNote, ok.body.note);
  const asClient = JSON.stringify([(await clients[1010].call("GET", "/api/links")).body, (await clients[1010].call("GET", "/api/links/" + L[1010] + "/messages")).body]);
  assert.ok(!asClient.includes("колен") || !asClient.includes("жима ногами"), "заметка тренера попала к клиенту");
  assert.ok(!asClient.includes("trainerNote") && !asClient.includes("trainer_note"));
  assert.equal((await T.t.call("PATCH", "/api/coach/clients/" + L[1010] + "/note", { note: "я".repeat(1001) })).status, 400);
  assert.equal((await T.t.call("PATCH", "/api/coach/clients/" + L[1010] + "/note", { note: "я".repeat(1000) })).status, 200);
  assert.equal((await T.t.call("PATCH", "/api/coach/clients/" + L[1010] + "/note", { note: 5 })).status, 400);
  assert.equal((await T.t.call("PATCH", "/api/coach/clients/" + L[1010] + "/note", {})).status, 400);
  assert.equal((await T2.t.call("PATCH", "/api/coach/clients/" + L[1010] + "/note", { note: "чужая" })).status, 404);
  assert.equal((await clients[1010].call("PATCH", "/api/coach/clients/" + L[1010] + "/note", { note: "я клиент" })).status, 403);
  assert.equal((await T.t.call("PATCH", "/api/coach/clients/" + L[1010] + "/note", { note: "   " })).body.note, "");
  assert.equal((await db.query("SELECT trainer_note FROM trainer_links WHERE id = $1", [L[1010]]))[0].trainer_note, null, "пустая заметка стирается");
  assert.equal((await T.t.call("PATCH", "/api/coach/clients/" + L[1010] + "/note", { note: "x" })).status, 200);
  assert.equal((await client(db).call("PATCH", "/api/coach/clients/" + L[1010] + "/note", { note: "x" })).status, 401);
  const csrf = await T.t.call("PATCH", "/api/coach/clients/" + L[1010] + "/note", { note: "x" }, { "x-fw": null });
  assert.equal(csrf.status, 403, "без заголовка защиты запрос не принимается");
});

dbtest("удаление клиента убирает его из кабинета; завершённая связь не показывает цифры", async () => {
  const { T, clients, L } = await build();
  const del = await clients[1011].call("DELETE", "/api/me", { password: "password1011" });
  assert.equal(del.status, 200, JSON.stringify(del.body));
  const r = await T.t.call("GET", "/api/coach/overview");
  assert.equal(byLink(r, L[1011]), undefined);
  assert.equal((await T.t.call("GET", "/api/coach/clients/" + L[1011])).status, 404);
  await T.t.call("POST", "/api/links/" + L[1012] + "/end", {});
  const ended = await T.t.call("GET", "/api/coach/clients/" + L[1012]);
  assert.deepEqual([ended.body.client.status, ended.body.goals, ended.body.stats, ended.body.series], ["ended", null, null, null]);
});
