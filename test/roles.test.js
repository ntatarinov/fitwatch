// Роли: пользователь, VIP-клиент (действующий платный тариф), тренер, администратор. Назначает администратор.
const test = require("node:test"), assert = require("node:assert/strict");
const { makeDb, client, newUser, makeAdmin } = require("./api.helpers");

let db;
test.before(async () => { db = await makeDb(); });
test.after(async () => { if (db) await db.close(); });
const dbtest = (name, fn) => test(name, async t => { if (!db) return t.skip("нет @electric-sql/pglite"); await fn(t); });
const uid = async n => (await db.query("SELECT id FROM users WHERE email = $1", ["u" + n + "@test.kz"]))[0].id;

let W;
async function world() {
  if (W) return W;
  const boss = await newUser(db, 3000), a = await newUser(db, 3001), b = await newUser(db, 3002), c = await newUser(db, 3003);
  await makeAdmin(db, "u3000@test.kz");
  W = { boss, a, b, c, ids: { boss: await uid(3000), a: await uid(3001), b: await uid(3002), c: await uid(3003) } };
  return W;
}

dbtest("только администратор видит пользователей и меняет роли", async () => {
  const { a, ids } = await world();
  assert.equal((await client(db).call("GET", "/api/admin/users")).status, 401);
  assert.equal((await a.call("GET", "/api/admin/users")).status, 403);
  assert.equal((await a.call("POST", "/api/admin/users/" + ids.b + "/role", { role: "admin", on: true })).status, 403);
  assert.equal((await a.call("POST", "/api/admin/users/" + ids.a + "/vip", { tier: "personal", days: 30 })).status, 403, "сам себе VIP не выдаст");
});

dbtest("роль в профиле: пользователь, затем VIP, тренер и администратор", async () => {
  const { boss, a, ids } = await world();
  let me = (await a.call("GET", "/api/me")).body.user;
  assert.deepEqual([me.isAdmin, me.isTrainer, me.isVip, me.tier], [false, false, false, "free"]);
  const vip = await boss.call("POST", "/api/admin/users/" + ids.a + "/vip", { tier: "personal", days: 30 });
  assert.equal(vip.status, 200);
  assert.equal(vip.body.user.roles.tier, "personal");
  const tr = await boss.call("POST", "/api/admin/users/" + ids.a + "/role", { role: "trainer", on: true });
  assert.equal(tr.body.user.roles.trainer, "approved");
  me = (await a.call("GET", "/api/me")).body.user;
  assert.deepEqual([me.isTrainer, me.isVip, me.tier], [true, true, "personal"]);
  assert.ok(new Date(me.tierUntil) > new Date(Date.now() + 29 * 86400000));
  assert.equal((await a.call("GET", "/api/coach/overview")).status, 200, "назначенный тренер получает кабинет");
  const ad = await boss.call("POST", "/api/admin/users/" + ids.a + "/role", { role: "admin", on: true });
  assert.deepEqual([ad.body.user.roles.admin, ad.body.user.roles.adminFromSettings], [true, false]);
  assert.equal((await a.call("GET", "/api/me")).body.user.isAdmin, true);
  assert.equal((await a.call("GET", "/api/admin/users")).status, 200, "назначенный администратор видит панель");
});

dbtest("снятие ролей: тренер теряет клиентов, VIP сбрасывается, себя и администратора из настроек не снять", async () => {
  const { boss, a, b, ids } = await world();
  await boss.call("POST", "/api/admin/users/" + ids.b + "/vip", { tier: "personal", days: 10 });
  const req = await b.call("POST", "/api/trainers/" + ids.a + "/request", {});
  assert.equal(req.status, 201);
  assert.equal((await a.call("POST", "/api/links/" + req.body.id + "/accept", {})).status, 200);
  const off = await boss.call("POST", "/api/admin/users/" + ids.a + "/role", { role: "trainer", on: false });
  assert.equal(off.body.user.roles.trainer, "rejected");
  assert.equal((await db.query("SELECT status FROM trainer_links WHERE id = $1", [req.body.id]))[0].status, "ended");
  assert.equal((await a.call("GET", "/api/coach/overview")).status, 403);
  const nv = await boss.call("POST", "/api/admin/users/" + ids.b + "/vip", { tier: "none" });
  assert.equal(nv.body.user.roles.tier, "free");
  assert.equal((await b.call("GET", "/api/subscription")).body.tier, "free");
  assert.equal((await boss.call("POST", "/api/admin/users/" + ids.boss + "/role", { role: "admin", on: false })).status, 409, "себя не снять");
  assert.equal((await a.call("POST", "/api/admin/users/" + ids.boss + "/role", { role: "admin", on: false })).status, 409, "администратора из настроек не снять в приложении");
  assert.equal((await a.call("POST", "/api/admin/users/" + ids.a + "/role", { role: "admin", on: false })).status, 409);
  assert.equal((await boss.call("POST", "/api/admin/users/" + ids.a + "/role", { role: "admin", on: false })).status, 200);
  assert.equal((await a.call("GET", "/api/me")).body.user.isAdmin, false);
});

dbtest("поиск и фильтр по ролям; неверный ввод — 400 и 404", async () => {
  const { boss, ids } = await world();
  await boss.call("POST", "/api/admin/users/" + ids.c + "/vip", { tier: "premium", days: 5 });
  const byName = (await boss.call("GET", "/api/admin/users?q=" + encodeURIComponent("Игрок3003"))).body.items;
  assert.deepEqual(byName.map(u => u.id), [ids.c]);
  assert.equal((await boss.call("GET", "/api/admin/users?q=" + encodeURIComponent("%"))).body.items.length, 0, "% ищется как символ, а не «всё»");
  const vips = (await boss.call("GET", "/api/admin/users?role=vip")).body.items.map(u => u.id);
  assert.ok(vips.includes(ids.c) && !vips.includes(ids.b));
  const admins = (await boss.call("GET", "/api/admin/users?role=admin")).body.items.map(u => u.id);
  assert.ok(admins.includes(ids.boss) && !admins.includes(ids.c));
  const plain = (await boss.call("GET", "/api/admin/users?role=user")).body.items.map(u => u.id);
  assert.ok(plain.includes(ids.b) && !plain.includes(ids.c) && !plain.includes(ids.boss));
  assert.equal((await boss.call("GET", "/api/admin/users?role=god")).status, 400);
  assert.equal((await boss.call("POST", "/api/admin/users/" + ids.c + "/role", { role: "god", on: true })).status, 400);
  assert.equal((await boss.call("POST", "/api/admin/users/" + ids.c + "/role", { role: "admin", on: "yes" })).status, 400);
  assert.equal((await boss.call("POST", "/api/admin/users/" + ids.c + "/vip", { tier: "premium", days: 0 })).status, 400);
  assert.equal((await boss.call("POST", "/api/admin/users/00000000-0000-4000-8000-000000000000/vip", { tier: "premium", days: 5 })).status, 404);
  const one = (await boss.call("GET", "/api/admin/users?q=Игрок3003")).body.items[0];
  assert.ok(!("password_hash" in one) && !JSON.stringify(one).includes("scrypt"), "хэш пароля не уходит даже администратору");
});
