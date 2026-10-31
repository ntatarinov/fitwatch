const test = require("node:test"), assert = require("node:assert/strict");
const crypto = require("crypto");
process.env.TELEGRAM_CLIENT_ID = "8927501590";
process.env.ADMIN_TELEGRAM_IDS = "777";
delete process.env.TELEGRAM_BOT_TOKEN;
const { makeDb, client, newUser } = require("./api.helpers");
const T = require("../api/_lib/telegram");
const NOW = Math.floor(new Date("2026-11-02T10:00:00Z").getTime() / 1000), CID = "8927501590";

// Ключи, как у Telegram: RS256, ES256 и EdDSA; открытая часть превращается в JWKS.
const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }), ec = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" }), ed = crypto.generateKeyPairSync("ed25519");
const attacker = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = (pair, alg, kid) => Object.assign(pair.publicKey.export({ format: "jwk" }), { alg, kid });
const JWKS = { keys: [jwk(rsa, "RS256", "oidc-1"), jwk(ec, "ES256", "oidc-2"), jwk(ed, "EdDSA", "oidc-3")] };
const b64 = o => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
function jwt(claims, o) {
  o = o || {};
  const alg = o.alg || "RS256", pair = o.pair || { RS256: rsa, ES256: ec, EdDSA: ed }[alg];
  const header = { alg, typ: "JWT", kid: o.kid === undefined ? { RS256: "oidc-1", ES256: "oidc-2", EdDSA: "oidc-3" }[alg] : o.kid };
  const signed = b64(header) + "." + b64(claims);
  if (alg === "none") return signed + ".";
  if (alg === "HS256") return signed + "." + crypto.createHmac("sha256", o.secret).update(signed).digest("base64url");
  const sig = alg === "ES256" ? crypto.sign("sha256", Buffer.from(signed), { key: pair.privateKey, dsaEncoding: "ieee-p1363" }) : alg === "EdDSA" ? crypto.sign(null, Buffer.from(signed), pair.privateKey) : crypto.sign("sha256", Buffer.from(signed), pair.privateKey);
  return signed + "." + sig.toString("base64url");
}
const claims = (extra) => Object.assign({ iss: "https://oauth.telegram.org", aud: CID, sub: "1001", id: 1001, name: "Алия Иванова", preferred_username: "aliya_fit", iat: NOW - 5, exp: NOW + 600, nonce: "n1" }, extra || {});
const verify = (tok, over) => T.verifyIdToken(tok, Object.assign({ clientId: CID, jwks: JWKS, nowSec: NOW }, over || {}));
const fails = (tok, code, over) => assert.throws(() => verify(tok, over), e => e.message === code, "ожидался отказ " + code);

test("id_token: верные подписи RS256, ES256 и EdDSA принимаются", () => {
  ["RS256", "ES256", "EdDSA"].forEach(alg => assert.equal(verify(jwt(claims(), { alg })).id, 1001, alg));
  assert.equal(verify(jwt(claims({ aud: ["x", CID] }))).id, 1001);                 // аудитория списком
});

test("id_token: подделки и ошибки отклоняются", () => {
  fails(jwt(claims(), { pair: attacker }), "signature");                          // подписан чужим ключом
  const good = jwt(claims());
  const [h, p, s] = good.split(".");
  fails(h + "." + b64(claims({ id: 2002, sub: "2002" })) + "." + s, "signature");  // изменили данные
  assert.throws(() => verify(jwt(claims(), { alg: "none" })), /malformed|alg/);                 // без подписи не проходит
  fails(jwt(claims(), { alg: "HS256", secret: JSON.stringify(JWKS.keys[0]) }), "alg"); // подмена алгоритма
  fails(jwt(claims(), { kid: "нет-такого" }), "kid");
  fails(jwt(claims({ iss: "https://evil.example" })), "iss");
  fails(jwt(claims({ aud: "12345" })), "aud");
  fails(jwt(claims({ exp: NOW - 120 })), "exp");
  fails(jwt(claims({ iat: NOW - 1000 })), "iat");                                  // выдан давно
  fails(jwt(claims({ iat: NOW + 500 })), "iat");                                   // из будущего
  fails(jwt(claims({ nonce: undefined })), "nonce");
  fails("мусор", "malformed"); fails("a.b", "malformed"); fails(null, "malformed"); fails(h + ".." + s, "malformed");
  fails(good, "aud", { clientId: "999" });
  fails(good, "kid", { jwks: { keys: [] } });
});

let db;
test.before(async () => { db = await makeDb(); T.setJwksProvider(async () => JWKS); });
test.after(async () => { T.setJwksProvider(null); if (db) await db.close(); });
const dbtest = (name, fn) => test(name, async t => { if (!db) return t.skip("нет @electric-sql/pglite"); await fn(t); });
const NOWD = "2026-11-02T10:00:00Z";
const browser = ip => { const c = client(db, NOWD); c.setIp(ip); return c; };
const nonceFor = async c => (await c.call("POST", "/api/auth/telegram/nonce", {})).body.nonce;
// Полный путь: страница просит nonce, Telegram выдаёт токен с этим nonce, страница отправляет токен серверу.
async function login(c, user, extra) {
  const nonce = await nonceFor(c);
  const tok = jwt(claims(Object.assign({ nonce }, user || {}, extra || {})));
  return { res: await c.call("POST", "/api/auth/telegram", { id_token: tok }), tok, nonce };
}

dbtest("настройки: публичен только Client ID, никаких секретов", async () => {
  const r = await client(db).call("GET", "/api/config");
  assert.deepEqual(r.body, { telegramEnabled: true, telegramClientId: 8927501590 });
});

dbtest("вход: создание аккаунта, повторный вход, повтор токена, чужой nonce", async () => {
  const c = browser("30.0.0.1");
  const first = await login(c, { id: 3001, sub: "3001" });
  assert.deepEqual([first.res.status, first.res.body.created, first.res.body.user.name], [201, true, "Алия Иванова"]);
  assert.match(first.res.cookies[0], /fw_session=.+; HttpOnly; SameSite=Lax; Path=\/; Max-Age=\d+; Secure/);
  const me = (await c.call("GET", "/api/me")).body.user;
  assert.deepEqual([me.email, me.hasPassword, me.telegram.linked, me.telegram.username, me.isAdmin], [null, false, true, "aliya_fit", false]);
  // тот же токен второй раз: одноразовый nonce уже потрачен
  const replay = await browser("30.0.0.2").call("POST", "/api/auth/telegram", { id_token: first.tok });
  assert.deepEqual([replay.status, replay.body.error], [401, "Вход устарел, нажмите кнопку ещё раз"]);
  // другое устройство, новый nonce: тот же аккаунт
  const again = await login(browser("30.0.0.3"), { id: 3001, sub: "3001" });
  assert.deepEqual([again.res.status, again.res.body.created], [200, false]);
  assert.equal(Number((await db.query("SELECT count(*)::int AS n FROM users WHERE telegram_id = 3001"))[0].n), 1);
  // nonce, которого сервер не выдавал
  const fake = await browser("30.0.0.4").call("POST", "/api/auth/telegram", { id_token: jwt(claims({ nonce: "выдуманный", id: 3002 })) });
  assert.equal(fake.status, 401);
  // протухший nonce
  const c5 = browser("30.0.0.5"), n5 = await nonceFor(c5);
  await db.query("UPDATE login_nonces SET created_at = now() - interval '20 minutes' WHERE nonce = $1", [n5]);
  assert.equal((await c5.call("POST", "/api/auth/telegram", { id_token: jwt(claims({ nonce: n5, id: 3003 })) })).status, 401);
});

dbtest("вход: подделанный токен, чужая аудитория, имя, администратор, ключи недоступны", async () => {
  const c = browser("30.1.0.1");
  const n = await nonceFor(c), good = jwt(claims({ nonce: n, id: 3101 }));
  const [h, p, s] = good.split(".");
  assert.deepEqual([(await c.call("POST", "/api/auth/telegram", { id_token: h + "." + b64(claims({ nonce: n, id: 777 })) + "." + s })).status], [401]);
  assert.equal((await c.call("POST", "/api/auth/telegram", { id_token: jwt(claims({ nonce: n, aud: "1" })) })).status, 401);
  assert.equal((await c.call("POST", "/api/auth/telegram", {})).status, 401);
  assert.equal((await c.call("POST", "/api/auth/telegram", { id_token: good })).status, 201);   // настоящий всё ещё проходит: неудачные попытки nonce не тратят
  const odd = await login(browser("30.1.0.2"), { id: 3102, sub: "3102", name: "А", preferred_username: "!!" });
  assert.equal(odd.res.body.user.name, "Игрок3102");
  const adm = browser("30.1.0.3");
  await login(adm, { id: 777, sub: "777", name: "Босс" });
  assert.equal((await adm.call("GET", "/api/me")).body.user.isAdmin, true);
  assert.equal((await adm.call("POST", "/api/admin/promo", { tier: "premium", days: 5, maxUses: 1 })).status, 201);
  T.setJwksProvider(async () => { throw new Error("сеть недоступна"); });
  const down = browser("30.1.0.4"), dn = await nonceFor(down);
  assert.equal((await down.call("POST", "/api/auth/telegram", { id_token: jwt(claims({ nonce: dn, id: 3103 })) })).status, 401);
  T.setJwksProvider(async () => JWKS);
});

dbtest("ограничения: попытки входа и запросы nonce, защита заголовком", async () => {
  const c = browser("30.2.0.1");
  let last;
  for (let i = 0; i < 31; i++) last = await c.call("POST", "/api/auth/telegram", { id_token: "мусор" + i });
  assert.equal(last.status, 429);
  const d = browser("30.2.0.2");
  for (let i = 0; i < 61; i++) last = await d.call("POST", "/api/auth/telegram/nonce", {});
  assert.equal(last.status, 429);
  assert.equal((await client(db).call("POST", "/api/auth/telegram/nonce", {}, { "x-fw": null })).status, 403);
});

dbtest("привязка к аккаунту с почтой: данные сохраняются, чужой Telegram занять нельзя", async () => {
  const mail = await newUser(db, 800), other = await newUser(db, 801);
  mail.setNow(NOWD); other.setNow(NOWD);
  await mail.call("POST", "/api/workouts", { day: "2026-11-02", program: "plan", dayId: "w1" });
  const link = await login(mail, { id: 5001, sub: "5001" });
  assert.deepEqual([link.res.status, link.res.body.linked], [200, true]);
  const me = (await mail.call("GET", "/api/me")).body;
  assert.deepEqual([me.user.email, me.user.telegram.linked, me.user.hasPassword], ["u800@test.kz", true, true]);
  assert.equal((await login(other, { id: 5001, sub: "5001" })).res.status, 409);
  const c = browser("30.3.0.1");
  const r = await login(c, { id: 5001, sub: "5001" });
  assert.equal(r.res.body.created, false);
  assert.equal((await c.call("GET", "/api/me")).body.stats.points, 20);
});

dbtest("аккаунт через Telegram: без почты и пароля, удаление требует подтверждения и стирает всё", async () => {
  const c = browser("30.4.0.1");
  await login(c, { id: 6001, sub: "6001" });
  await c.call("POST", "/api/workouts", { day: "2026-11-02", program: "plan", dayId: "w1" });
  const row = (await db.query("SELECT email, password_hash FROM users WHERE telegram_id = 6001"))[0];
  assert.deepEqual([row.email, row.password_hash], [null, null]);
  assert.equal((await c.call("DELETE", "/api/me", {})).status, 403);
  assert.equal((await c.call("DELETE", "/api/me", { confirm: "нет" })).status, 403);
  assert.equal((await c.call("DELETE", "/api/me", { confirm: "DELETE" })).status, 200);
  assert.equal((await c.call("GET", "/api/me")).status, 401);
  assert.equal(Number((await db.query("SELECT count(*)::int AS n FROM users WHERE telegram_id = 6001"))[0].n), 0);
  assert.equal((await login(browser("30.4.0.2"), { id: 6001, sub: "6001" })).res.body.created, true);
});

dbtest("база: нужен способ входа; миграции повторяются без ошибок", async () => {
  await assert.rejects(() => db.query("INSERT INTO users(display_name) VALUES ('Без входа')"));
  const { migrate } = require("../api/_lib/db");
  await migrate(db); await migrate(db);
});

dbtest("без настроек вход через Telegram отключён", async () => {
  const saved = process.env.TELEGRAM_CLIENT_ID;
  delete process.env.TELEGRAM_CLIENT_ID;
  const c = client(db);
  assert.equal((await c.call("POST", "/api/auth/telegram/nonce", {})).status, 503);
  assert.equal((await c.call("POST", "/api/auth/telegram", { id_token: "x" })).status, 503);
  assert.deepEqual((await c.call("GET", "/api/config")).body, { telegramEnabled: false, telegramClientId: null });
  process.env.TELEGRAM_CLIENT_ID = saved;
});

dbtest("nonce привязан к браузеру: перехваченный токен из другого браузера не входит", async () => {
  const owner = browser("30.0.1.1"), thief = browser("30.0.1.2");
  const nonce = await nonceFor(owner);
  assert.match(owner.cookie(), /fw_tgn=/, "браузер получил cookie с хэшем nonce");
  const tok = jwt(claims({ nonce, id: 4001, sub: "4001" }));
  const stolen = await thief.call("POST", "/api/auth/telegram", { id_token: tok });
  assert.equal(stolen.status, 401, "чужой браузер без cookie не входит");
  const ok = await owner.call("POST", "/api/auth/telegram", { id_token: tok });
  assert.equal(ok.status, 201, "хозяин входит: nonce не был потрачен попыткой вора");
  assert.ok(!/fw_tgn=/.test(owner.cookie()), "после входа cookie с nonce удалена");
  assert.match(owner.cookie(), /fw_session=/);
});
