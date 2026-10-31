// Регрессии по аудиту сервера: каждая проверка воспроизводит найденную ошибку и подтверждает исправление.
const test = require("node:test"), assert = require("node:assert/strict");
const { makeDb, client, newUser, makeAdmin } = require("./api.helpers");

let db;
test.before(async () => { db = await makeDb(); });
test.after(async () => { if (db) await db.close(); });
const dbtest = (name, fn) => test(name, async t => { if (!db) return t.skip("нет @electric-sql/pglite"); await fn(t); });
const uid = async email => (await db.query("SELECT id FROM users WHERE email = $1", [email]))[0].id;

let admin;
async function adminClient() {
  if (admin) return admin;
  admin = await newUser(db, 2000);
  await makeAdmin(db, "u2000@test.kz");
  await admin.call("POST", "/api/admin/promo", { tier: "personal", days: 30, maxUses: 100, code: "AUD-PERS" });
  return admin;
}
async function trainerWithClient(n) {
  const adm = await adminClient();
  const t = await newUser(db, n), c = await newUser(db, n + 1);
  await t.call("POST", "/api/trainer/apply", { bio: "Тренер по силовым, 8 лет опыта, работаю с новичками.", specialties: "" });
  const tid = await uid("u" + n + "@test.kz");
  await adm.call("POST", "/api/admin/trainers/" + tid + "/approve", {});
  await c.call("POST", "/api/subscription/redeem", { code: "AUD-PERS" });
  const req = await c.call("POST", "/api/trainers/" + tid + "/request", {});
  assert.equal(req.status, 201);
  return { adm, t, c, tid, link: req.body.id };
}

dbtest("почта из ADMIN_EMAILS не даёт прав: занять почту администратора бесполезно", async () => {
  process.env.ADMIN_EMAILS = "boss@fitwatch.kz";
  const evil = client(db); evil.setIp("10.20.0.1");
  assert.equal((await evil.call("POST", "/api/auth/register", { email: "Boss@FitWatch.kz", password: "password-1", name: "Злой" })).status, 201);
  assert.equal((await evil.call("GET", "/api/me")).body.user.isAdmin, false);
  assert.equal((await evil.call("POST", "/api/admin/promo", { tier: "personal", days: 366, maxUses: 1000 })).status, 403);
  delete process.env.ADMIN_EMAILS;
});

dbtest("тренер, с которого сняли подтверждение, теряет доступ к клиентам и переписке; связи закрываются", async () => {
  const { adm, t, c, tid, link } = await trainerWithClient(2010);
  assert.equal((await t.call("POST", "/api/links/" + link + "/accept", {})).status, 200);
  await c.call("PATCH", "/api/links/" + link + "/share", { goals: true, results: true });
  assert.equal((await t.call("GET", "/api/links/" + link + "/client")).status, 200);
  assert.equal((await adm.call("POST", "/api/admin/trainers/" + tid + "/reject", {})).status, 200);
  assert.equal((await t.call("GET", "/api/links/" + link + "/client")).status, 403);
  assert.equal((await t.call("POST", "/api/links/" + link + "/messages", { body: "привет" })).status, 403);
  assert.equal((await t.call("GET", "/api/coach/overview")).status, 403);
  assert.equal((await db.query("SELECT status FROM trainer_links WHERE id = $1", [link]))[0].status, "ended", "открытые связи закрыты");
  assert.equal((await c.call("GET", "/api/links")).body.items[0].status, "ended", "клиент видит, что работа завершена");
});

dbtest("подписка клиента закончилась: тренер не может принять запрос, переписка не отправляется", async () => {
  const { t, c, link } = await trainerWithClient(2020);
  await db.query("UPDATE subscriptions SET until = now() - interval '1 day' WHERE user_id = $1", [await uid("u2021@test.kz")]);
  assert.equal((await t.call("POST", "/api/links/" + link + "/accept", {})).status, 409);
  await db.query("UPDATE subscriptions SET until = now() + interval '5 days' WHERE user_id = $1", [await uid("u2021@test.kz")]);
  assert.equal((await t.call("POST", "/api/links/" + link + "/accept", {})).status, 200);
  assert.equal((await c.call("POST", "/api/links/" + link + "/messages", { body: "Здравствуйте" })).status, 201);
  await db.query("UPDATE subscriptions SET until = now() - interval '1 day' WHERE user_id = $1", [await uid("u2021@test.kz")]);
  assert.equal((await c.call("POST", "/api/links/" + link + "/messages", { body: "Ещё вопрос" })).status, 403);
  assert.equal((await t.call("POST", "/api/links/" + link + "/messages", { body: "Ответ" })).status, 403);
  assert.equal((await c.call("GET", "/api/links/" + link + "/messages")).body.items.length, 1, "история переписки остаётся");
});

dbtest("чужие неверные пароли с разных адресов не блокируют хозяина почты", async () => {
  await newUser(db, 2030);
  for (let i = 0; i < 12; i++) { const x = client(db); x.setIp("10.30.0." + i); await x.call("POST", "/api/auth/login", { email: "u2030@test.kz", password: "wrong-" + i }); }
  const me = client(db); me.setIp("10.30.9.9");
  assert.equal((await me.call("POST", "/api/auth/login", { email: "u2030@test.kz", password: "password2030" })).status, 200);
  const brute = client(db); brute.setIp("10.30.9.10");
  for (let i = 0; i < 10; i++) await brute.call("POST", "/api/auth/login", { email: "u2030@test.kz", password: "bad" + i });
  assert.equal((await brute.call("POST", "/api/auth/login", { email: "u2030@test.kz", password: "password2030" })).status, 429, "с одного адреса перебор по-прежнему ограничен");
});

dbtest("замеры: показываются последние 400, а не первые; после удаления в профиле последний оставшийся", async () => {
  const c = await newUser(db, 2040);
  const id = await uid("u2040@test.kz");
  await db.query("INSERT INTO measurements(user_id, kind, value, measured_on) SELECT $1, 'weight', 80, (date '2026-11-02' - g)::date FROM generate_series(1, 450) g", [id]);
  assert.equal((await c.call("POST", "/api/measurements", { kind: "weight", value: 70 })).status, 201);
  const r = await c.call("GET", "/api/measurements?kind=weight");
  assert.equal(r.body.items.length, 400);
  assert.equal(r.body.items[r.body.items.length - 1].value, 70, "сегодняшний замер виден");
  assert.ok(r.body.items[0].day < r.body.items[1].day, "по возрастанию даты");
  const mistake = await c.call("POST", "/api/measurements", { kind: "weight", value: 300, day: "2026-11-03" });
  assert.equal((await c.call("GET", "/api/me")).body.profile.weight, 300);
  await c.call("DELETE", "/api/measurements/" + mistake.body.id);
  assert.equal((await c.call("GET", "/api/me")).body.profile.weight, 70, "в профиле снова последний настоящий замер");
});

dbtest("неверный ввод даёт 400, а не 500", async () => {
  const c = await newUser(db, 2050);
  const adm = await adminClient();
  await c.call("POST", "/api/subscription/redeem", { code: "AUD-PERS" });
  const ret = [];
  ret.push(["эмодзи в описании тренера", (await c.call("POST", "/api/trainer/apply", { bio: "💪".repeat(10) + " тренер", specialties: "" })).status]);
  ret.push(["нулевой символ в имени", (await client(db).call("POST", "/api/auth/register", { email: "nul@test.kz", password: "password-1", name: "Ан\u0000на" })).status]);
  ret.push(["нулевой символ в почте", (await client(db).call("POST", "/api/auth/register", { email: "n\u0000l@test.kz", password: "password-1", name: "Анна" })).status]);
  ret.push(["UUID из дефисов", (await c.call("POST", "/api/trainers/------------------------------------/request", {})).status]);
  ret.push(["UUID из дефисов у админа", (await adm.call("POST", "/api/admin/trainers/------------------------------------/approve", {})).status]);
  ret.push(["огромный id замера", (await c.call("DELETE", "/api/measurements/99999999999999999999")).status]);
  ret.push(["огромный id связи", (await c.call("GET", "/api/links/99999999999999999999/messages")).status]);
  ret.forEach(([what, s]) => assert.ok(s >= 400 && s < 500, what + ": " + s));
  assert.equal((await c.call("POST", "/api/trainer/apply", { bio: "💪".repeat(20), specialties: "" })).status, 201, "20 эмодзи — это 20 символов, как в базе");
});
