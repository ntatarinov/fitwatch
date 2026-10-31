const test = require("node:test"), assert = require("node:assert/strict");
process.env.ADMIN_EMAILS = "u900@test.kz"; // должна НЕ давать прав: проверяется ниже
const { makeDb, client, newUser, makeAdmin } = require("./api.helpers");
const P = require("../api/_lib/programs");

let db;
test.before(async () => { db = await makeDb(); });
test.after(async () => { if (db) await db.close(); });
const dbtest = (name, fn) => test(name, async t => { if (!db) return t.skip("нет @electric-sql/pglite"); await fn(t); });

// ---- закрытые программы ----
test("программы: упражнения есть в каталоге, фазы покрывают недели, у закрытых нет содержимого", () => {
  const { Catalog } = require("./setup"); // setup задаёт window, поэтому подключается после запуска базы
  assert.ok(P.PROGRAMS.length >= 4);
  P.PROGRAMS.forEach(p => {
    assert.ok(["premium", "personal"].includes(p.minTier), p.id);
    assert.ok(p.days.length >= 3 && p.phases.length >= 2, p.id);
    p.days.forEach(d => { assert.ok(d.items.length >= 3, p.id + "/" + d.id); d.items.forEach(i => assert.ok(Catalog.byId(i.ex), p.id + ": нет упражнения " + i.ex)); });
    const last = p.phases[p.phases.length - 1].weeks; // «8» или «3–4»
    assert.equal(Number(String(last).split("–").pop()), p.weeks, p.id + ": последняя фаза должна заканчиваться на неделе " + p.weeks);
    assert.ok(/^[a-z0-9]{1,24}$/.test(p.id) && p.days.every(d => /^[a-z0-9]{1,24}$/.test(d.id)), p.id + ": идентификаторы для сервера очков");
  });
  const free = P.listFor("free"), prem = P.listFor("premium");
  assert.ok(free.every(p => p.locked && !("days" in p) && !("phases" in p)));
  assert.ok(prem.every(p => !p.locked && p.days.length >= 3));
});

dbtest("тариф и промокоды: права администратора, погашение, лимиты, продление", async () => {
  const admin = await newUser(db, 900), a = await newUser(db, 901), b = await newUser(db, 902);
  assert.equal((await admin.call("GET", "/api/me")).body.user.isAdmin, false, "почта из ADMIN_EMAILS прав администратора не даёт");
  assert.equal((await admin.call("POST", "/api/admin/promo", { tier: "personal", days: 30, maxUses: 1 })).status, 403);
  await makeAdmin(db, "u900@test.kz");
  assert.equal((await admin.call("GET", "/api/me")).body.user.isAdmin, true);
  assert.equal((await a.call("GET", "/api/me")).body.user.isAdmin, false);
  assert.equal((await client(db).call("GET", "/api/subscription")).status, 401);
  assert.equal((await a.call("GET", "/api/subscription")).body.tier, "free");
  assert.equal((await a.call("POST", "/api/admin/promo", { tier: "premium", days: 30, maxUses: 1 })).status, 403);
  assert.equal((await admin.call("POST", "/api/admin/promo", { tier: "gold", days: 30, maxUses: 1 })).status, 400);
  assert.equal((await admin.call("POST", "/api/admin/promo", { tier: "premium", days: 0, maxUses: 1 })).status, 400);
  assert.equal((await admin.call("POST", "/api/admin/promo", { tier: "premium", days: 30, maxUses: 1, code: "!!" })).status, 400);
  const mk = await admin.call("POST", "/api/admin/promo", { tier: "premium", days: 30, maxUses: 1, code: "prem-one" });
  assert.deepEqual([mk.status, mk.body.code], [201, "PREM-ONE"]);
  assert.equal((await admin.call("POST", "/api/admin/promo", { tier: "premium", days: 30, maxUses: 1, code: "PREM-ONE" })).status, 409);
  assert.equal((await admin.call("GET", "/api/admin/promo")).body.items[0].code, "PREM-ONE");
  // закрытые программы до погашения
  const before = (await a.call("GET", "/api/programs")).body;
  assert.equal(before.tier, "free"); assert.ok(before.items.every(p => p.locked && !p.days));
  assert.ok(!JSON.stringify(before).includes("db_bench"), "содержимое закрытой программы утекло");
  assert.equal((await a.call("POST", "/api/subscription/redeem", { code: "??" })).status, 400);
  assert.equal((await a.call("POST", "/api/subscription/redeem", { code: "NO-SUCH" })).status, 404);
  const red = await a.call("POST", "/api/subscription/redeem", { code: " prem-one " });
  assert.equal(red.status, 200); assert.equal(red.body.tier, "premium");
  assert.ok(new Date(red.body.until) > new Date(Date.now() + 29 * 86400000));
  const open = (await a.call("GET", "/api/programs")).body;
  assert.ok(open.items.every(p => !p.locked && p.days.length >= 3));
  assert.equal((await a.call("POST", "/api/subscription/redeem", { code: "PREM-ONE" })).status, 409);  // тот же человек
  assert.equal((await b.call("POST", "/api/subscription/redeem", { code: "PREM-ONE" })).status, 404);  // лимит исчерпан
  assert.equal((await db.query("SELECT used FROM promo_codes WHERE code = 'PREM-ONE'"))[0].used, 1);
  // повышение до персонального: срок считается от сегодня (оставшийся премиум не превращается в персональный)
  await admin.call("POST", "/api/admin/promo", { tier: "personal", days: 10, maxUses: 5, code: "PERS-TEN" });
  await admin.call("POST", "/api/admin/promo", { tier: "personal", days: 5, maxUses: 5, code: "PERS-FIVE" });
  await admin.call("POST", "/api/admin/promo", { tier: "premium", days: 20, maxUses: 5, code: "PREM-TWENTY" });
  const days = until => (new Date(until) - Date.now()) / 86400000;
  const up = await a.call("POST", "/api/subscription/redeem", { code: "PERS-TEN" });
  assert.equal(up.body.tier, "personal");
  assert.ok(days(up.body.until) > 9.9 && days(up.body.until) < 10.1, "персональный на 10 дней от сегодня: " + days(up.body.until));
  // код младшего тарифа во время персонального не тратится и не продлевает его
  const low = await a.call("POST", "/api/subscription/redeem", { code: "PREM-TWENTY" });
  assert.equal(low.status, 409);
  assert.equal((await db.query("SELECT used FROM promo_codes WHERE code = 'PREM-TWENTY'"))[0].used, 0, "код не потрачен");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM promo_redemptions WHERE code = 'PREM-TWENTY'"))[0].n, 0);
  // тот же тариф продлевает срок
  const ext = await a.call("POST", "/api/subscription/redeem", { code: "PERS-FIVE" });
  assert.equal(ext.body.tier, "personal");
  assert.ok(days(ext.body.until) > 14.9 && days(ext.body.until) < 15.1, "продление на 5 дней: " + days(ext.body.until));
  // срок истёк → бесплатный; теперь премиум-код срабатывает
  await db.query("UPDATE subscriptions SET until = now() - interval '1 day' WHERE user_id = (SELECT id FROM users WHERE email = 'u901@test.kz')");
  assert.equal((await a.call("GET", "/api/subscription")).body.tier, "free");
  assert.ok((await a.call("GET", "/api/programs")).body.items.every(p => p.locked));
  const after = await a.call("POST", "/api/subscription/redeem", { code: "PREM-TWENTY" });
  assert.equal(after.body.tier, "premium");
  assert.ok(days(after.body.until) > 19.9 && days(after.body.until) < 20.1);
});

async function makeTrainer(n) {
  const t = await newUser(db, n);
  assert.equal((await t.call("POST", "/api/trainer/apply", { bio: "Тренер по силовым, 8 лет опыта, работаю с новичками.", specialties: "сила, масса" })).status, 201);
  const admin = await newUser(db, 900 + (n % 50) + 100);
  return { t, admin };
}

dbtest("тренер: заявка, подтверждение только администратором, список", async () => {
  const t = await newUser(db, 910), c = await newUser(db, 911), admin = client(db);
  admin.setIp("10.9.9.9");
  await admin.call("POST", "/api/auth/login", { email: "u900@test.kz", password: "password900" });
  assert.equal((await t.call("POST", "/api/trainer/apply", { bio: "коротко", specialties: "x" })).status, 400);
  assert.equal((await t.call("POST", "/api/trainer/apply", { bio: "Тренер по силовым, 8 лет опыта, работаю с новичками.", specialties: "x".repeat(201) })).status, 400);
  const ap = await t.call("POST", "/api/trainer/apply", { bio: "Тренер по силовым, 8 лет опыта, работаю с новичками.", specialties: "сила, масса" });
  assert.deepEqual([ap.status, ap.body.status], [201, "pending"]);
  assert.equal((await t.call("GET", "/api/trainer/me")).body.profile.status, "pending");
  assert.equal((await c.call("GET", "/api/trainers")).body.items.length, 0);       // пока не подтверждён
  const pending = (await admin.call("GET", "/api/admin/trainers?status=pending")).body.items;
  assert.equal(pending.length, 1); assert.equal(pending[0].name, "Игрок910");
  assert.equal((await c.call("GET", "/api/admin/trainers")).status, 403);
  assert.equal((await c.call("POST", "/api/admin/trainers/" + pending[0].id + "/approve", {})).status, 403);
  assert.equal((await t.call("POST", "/api/admin/trainers/" + pending[0].id + "/approve", {})).status, 403); // сам себя не подтвердит
  assert.equal((await admin.call("POST", "/api/admin/trainers/00000000-0000-0000-0000-000000000000/approve", {})).status, 404);
  assert.equal((await admin.call("POST", "/api/admin/trainers/" + pending[0].id + "/approve", {})).body.status, "approved");
  const list = (await c.call("GET", "/api/trainers")).body.items;
  assert.deepEqual(list.map(x => [x.name, x.specialties]), [["Игрок910", "сила, масса"]]);
  assert.equal((await t.call("GET", "/api/trainers")).body.items.length, 0);       // себя не видит
  assert.equal((await t.call("POST", "/api/trainer/apply", { bio: "Новое описание, достаточно длинное для проверки.", specialties: "" })).status, 409);
  const t2 = await newUser(db, 912);
  await t2.call("POST", "/api/trainer/apply", { bio: "Другой тренер, у которого достаточно длинное описание.", specialties: "" });
  const p2 = (await admin.call("GET", "/api/admin/trainers?status=pending")).body.items[0];
  assert.equal((await admin.call("POST", "/api/admin/trainers/" + p2.id + "/reject", {})).body.status, "rejected");
  assert.equal((await c.call("GET", "/api/trainers")).body.items.length, 1);
  assert.equal((await t2.call("POST", "/api/trainer/apply", { bio: "Исправленное описание, после отказа можно подать снова.", specialties: "" })).status, 201);
});

async function setup(n) {
  const admin = client(db); admin.setIp("10.9.8." + n);
  await admin.call("POST", "/api/auth/login", { email: "u900@test.kz", password: "password900" });
  const trainer = await newUser(db, n), cl = await newUser(db, n + 1), stranger = await newUser(db, n + 2);
  await trainer.call("POST", "/api/trainer/apply", { bio: "Тренер по силовым, 8 лет опыта, работаю с новичками.", specialties: "" });
  const id = (await admin.call("GET", "/api/admin/trainers?status=pending")).body.items.find(x => x.name === "Игрок" + n).id;
  await admin.call("POST", "/api/admin/trainers/" + id + "/approve", {});
  await admin.call("POST", "/api/admin/promo", { tier: "personal", days: 30, maxUses: 50, code: "TRN-" + n });
  await cl.call("POST", "/api/subscription/redeem", { code: "TRN-" + n });
  return { admin, trainer, cl, stranger, trainerId: id };
}

dbtest("запрос тренеру: нужен тариф, дубликаты, принять и отклонить, посторонние не видят", async () => {
  const { trainer, cl, stranger, trainerId } = await setup(920);
  assert.equal((await stranger.call("POST", "/api/trainers/" + trainerId + "/request", {})).status, 403);       // без тарифа
  assert.equal((await cl.call("POST", "/api/trainers/" + trainerId + "/request", { note: "x".repeat(301) })).status, 400);
  assert.equal((await cl.call("POST", "/api/trainers/00000000-0000-0000-0000-000000000000/request", {})).status, 404);
  assert.equal((await trainer.call("POST", "/api/trainers/" + trainerId + "/request", {})).status, 400);         // себе самому нельзя
  const rq = await cl.call("POST", "/api/trainers/" + trainerId + "/request", { note: "Хочу набрать массу" });
  assert.deepEqual([rq.status, rq.body.status], [201, "requested"]);
  assert.equal((await cl.call("POST", "/api/trainers/" + trainerId + "/request", {})).status, 409);
  const link = rq.body.id;
  assert.equal((await cl.call("GET", "/api/links")).body.items[0].role, "client");
  const tl = (await trainer.call("GET", "/api/links")).body.items[0];
  assert.deepEqual([tl.role, tl.with.name, tl.note, tl.status], ["trainer", "Игрок921", "Хочу набрать массу", "requested"]);
  assert.equal((await stranger.call("GET", "/api/links")).body.items.length, 0);
  assert.equal((await stranger.call("GET", "/api/links/" + link + "/messages")).status, 404);
  assert.equal((await stranger.call("POST", "/api/links/" + link + "/accept", {})).status, 404);
  assert.equal((await cl.call("POST", "/api/links/" + link + "/accept", {})).status, 403);                       // клиент сам не примет
  assert.equal((await cl.call("GET", "/api/links/" + link + "/messages")).status, 409);                          // до принятия
  assert.equal((await trainer.call("POST", "/api/links/" + link + "/accept", {})).body.status, "active");
  assert.equal((await trainer.call("POST", "/api/links/" + link + "/accept", {})).status, 409);
  assert.equal((await trainer.call("POST", "/api/links/" + link + "/end", {})).body.status, "ended");
  assert.equal((await trainer.call("POST", "/api/links/" + link + "/end", {})).status, 409);
  // после завершения можно запросить снова; отказ тренера
  const rq2 = await cl.call("POST", "/api/trainers/" + trainerId + "/request", {});
  assert.equal(rq2.status, 201);
  assert.equal((await trainer.call("POST", "/api/links/" + rq2.body.id + "/decline", {})).body.status, "declined");
  assert.equal((await cl.call("POST", "/api/links/" + rq2.body.id + "/end", {})).status, 409);
});

dbtest("переписка: порядок, «моё», по частям, ограничения, ограничение частоты, после завершения только чтение", async () => {
  const { trainer, cl, stranger, trainerId } = await setup(930);
  const link = (await cl.call("POST", "/api/trainers/" + trainerId + "/request", {})).body.id;
  await trainer.call("POST", "/api/links/" + link + "/accept", {});
  assert.equal((await cl.call("POST", "/api/links/" + link + "/messages", { body: "   " })).status, 400);
  assert.equal((await cl.call("POST", "/api/links/" + link + "/messages", { body: "я".repeat(2001) })).status, 400);
  const m1 = (await cl.call("POST", "/api/links/" + link + "/messages", { body: "Здравствуйте! Хочу план на массу." })).body.id;
  const m2 = (await trainer.call("POST", "/api/links/" + link + "/messages", { body: "Добрый день, давайте обсудим цель." })).body.id;
  assert.ok(m2 > m1);
  const all = (await cl.call("GET", "/api/links/" + link + "/messages")).body.items;
  assert.deepEqual(all.map(x => [x.mine, x.body]), [[true, "Здравствуйте! Хочу план на массу."], [false, "Добрый день, давайте обсудим цель."]]);
  assert.deepEqual((await trainer.call("GET", "/api/links/" + link + "/messages?after=" + m1)).body.items.map(x => x.id), [m2]);
  assert.equal((await trainer.call("GET", "/api/links/" + link + "/messages?after=abc")).status, 400);
  assert.equal((await stranger.call("POST", "/api/links/" + link + "/messages", { body: "я вне переписки" })).status, 404);
  // частота: не больше 20 сообщений в минуту
  let last;
  for (let i = 0; i < 20; i++) last = await cl.call("POST", "/api/links/" + link + "/messages", { body: "сообщение " + i });
  assert.equal(last.status, 429);
  await cl.call("POST", "/api/links/" + link + "/end", {});
  assert.equal((await trainer.call("POST", "/api/links/" + link + "/messages", { body: "после конца" })).status, 409);
  assert.ok((await trainer.call("GET", "/api/links/" + link + "/messages")).body.items.length >= 2);
});

dbtest("согласие клиента: тренер видит только разрешённое и только клиента своей связи", async () => {
  const { trainer, cl, stranger, trainerId } = await setup(940);
  await cl.call("PATCH", "/api/me", { profile: { goal: "muscle", level: 2, days: 4, minutes: 45, place: "gym", limits: ["knees"], sex: "f", age: 30, height: 170, weight: 65 } });
  await cl.call("POST", "/api/workouts", { day: "2026-11-02", program: "plan", dayId: "w1", title: "День 1" });
  await cl.call("POST", "/api/measurements", { kind: "weight", value: 65.5, day: "2026-11-02" });
  const link = (await cl.call("POST", "/api/trainers/" + trainerId + "/request", {})).body.id;
  assert.equal((await trainer.call("GET", "/api/links/" + link + "/client")).status, 409);   // пока не принято
  await trainer.call("POST", "/api/links/" + link + "/accept", {});
  let v = (await trainer.call("GET", "/api/links/" + link + "/client")).body;
  assert.deepEqual([v.client.name, v.shareGoals, v.shareResults, v.goals, v.results], ["Игрок941", false, false, null, null]);
  assert.equal((await trainer.call("PATCH", "/api/links/" + link + "/share", { goals: true })).status, 403);   // тренер не может дать себе доступ
  assert.equal((await cl.call("PATCH", "/api/links/" + link + "/share", { goals: "да" })).status, 400);
  await cl.call("PATCH", "/api/links/" + link + "/share", { goals: true });
  v = (await trainer.call("GET", "/api/links/" + link + "/client")).body;
  assert.deepEqual(v.goals, { goal: "muscle", level: 2, days: 4, minutes: 45, place: "gym", limits: ["knees"] });
  assert.equal(v.results, null);
  assert.ok(!JSON.stringify(v).includes("65"), "вес утёк без согласия на результаты");
  await cl.call("PATCH", "/api/links/" + link + "/share", { results: true });
  v = (await trainer.call("GET", "/api/links/" + link + "/client")).body;
  assert.equal(v.results.workouts[0].title, "День 1"); assert.equal(v.results.measurements[0].value, 65.5);
  await cl.call("PATCH", "/api/links/" + link + "/share", { goals: false, results: false });
  v = (await trainer.call("GET", "/api/links/" + link + "/client")).body;
  assert.deepEqual([v.goals, v.results], [null, null]);
  assert.equal((await cl.call("GET", "/api/links/" + link + "/client")).status, 403);          // клиенту этот вид не нужен
  assert.equal((await stranger.call("GET", "/api/links/" + link + "/client")).status, 404);
});

dbtest("удаление аккаунта клиента стирает связь и переписку", async () => {
  const { trainer, cl, trainerId } = await setup(950);
  const link = (await cl.call("POST", "/api/trainers/" + trainerId + "/request", {})).body.id;
  await trainer.call("POST", "/api/links/" + link + "/accept", {});
  await cl.call("POST", "/api/links/" + link + "/messages", { body: "до удаления" });
  assert.equal((await cl.call("DELETE", "/api/me", { password: "password951" })).status, 200);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM trainer_links WHERE id = $1", [link]))[0].n, 0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM messages WHERE link_id = $1", [link]))[0].n, 0);
  assert.equal((await trainer.call("GET", "/api/links")).body.items.length, 0);
});

dbtest("согласие: два одновременных изменения не затирают друг друга", async () => {
  const { trainer, cl, trainerId } = await setup(960);
  const link = (await cl.call("POST", "/api/trainers/" + trainerId + "/request", {})).body.id;
  await trainer.call("POST", "/api/links/" + link + "/accept", {});
  await Promise.all([cl.call("PATCH", "/api/links/" + link + "/share", { goals: true }), cl.call("PATCH", "/api/links/" + link + "/share", { results: true })]);
  let v = (await trainer.call("GET", "/api/links/" + link + "/client")).body;
  assert.deepEqual([v.shareGoals, v.shareResults], [true, true]);
  await Promise.all([cl.call("PATCH", "/api/links/" + link + "/share", { goals: false }), cl.call("PATCH", "/api/links/" + link + "/share", { results: false })]);
  v = (await trainer.call("GET", "/api/links/" + link + "/client")).body;
  assert.deepEqual([v.shareGoals, v.shareResults, v.goals, v.results], [false, false, null, null]);
  const only = await cl.call("PATCH", "/api/links/" + link + "/share", { goals: true });
  assert.deepEqual([only.body.shareGoals, only.body.shareResults], [true, false]);
});
