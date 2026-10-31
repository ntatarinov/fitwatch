// Вход через Telegram по OpenID Connect (новая схема Telegram). Страница получает от Telegram id_token (JWT),
// сервер проверяет его подпись открытыми ключами Telegram (JWKS), издателя, адресата (Client ID бота), срок и одноразовый nonce.
// Секретный токен бота и Client Secret не нужны: проверка идёт только по открытым ключам.
const crypto = require("crypto");

const ISSUER = "https://oauth.telegram.org";
const JWKS_URL = "https://oauth.telegram.org/.well-known/jwks.json";
const ALGS = { RS256: { kty: "RSA", hash: "sha256" }, ES256: { kty: "EC", crv: "P-256", hash: "sha256", p1363: true }, EdDSA: { kty: "OKP", hash: null } };
const MAX_AGE_SEC = 900; // токен принимается в течение 15 минут после выдачи

const clientIdOf = () => String(process.env.TELEGRAM_CLIENT_ID || String(process.env.TELEGRAM_BOT_TOKEN || "").split(":")[0] || "").trim();

function decodeJwt(token) {
  const p = typeof token === "string" ? token.split(".") : [];
  if (p.length !== 3 || p.some(x => !/^[A-Za-z0-9_-]+$/.test(x))) return null;
  try {
    return { header: JSON.parse(Buffer.from(p[0], "base64url").toString()), payload: JSON.parse(Buffer.from(p[1], "base64url").toString()), sig: Buffer.from(p[2], "base64url"), signed: p[0] + "." + p[1] };
  } catch (e) { return null; }
}

// Проверка id_token. jwks — {keys: [...]}. Возвращает claims или бросает Error с кратким кодом.
function verifyIdToken(idToken, { clientId, jwks, nowSec }) {
  const t = decodeJwt(idToken);
  if (!t || !t.header || !t.payload) throw new Error("malformed");
  const rule = ALGS[t.header.alg];                       // алгоритм из заголовка разрешён только из списка; «none» и HS* не проходят
  if (!rule) throw new Error("alg");
  const keys = ((jwks && jwks.keys) || []).filter(k => k.kty === rule.kty && (!k.alg || k.alg === t.header.alg) && (!rule.crv || k.crv === rule.crv) && (!t.header.kid || k.kid === t.header.kid));
  if (!keys.length) throw new Error("kid");
  let valid = false;
  for (const jwk of keys) {
    try {
      const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
      valid = crypto.verify(rule.hash, Buffer.from(t.signed), rule.p1363 ? { key, dsaEncoding: "ieee-p1363" } : key, t.sig);
    } catch (e) { valid = false; }
    if (valid) break;
  }
  if (!valid) throw new Error("signature");
  const c = t.payload, now = nowSec === undefined ? Math.floor(Date.now() / 1000) : nowSec;
  if (c.iss !== ISSUER) throw new Error("iss");
  const aud = Array.isArray(c.aud) ? c.aud.map(String) : [String(c.aud)];
  if (!clientId || !aud.includes(String(clientId))) throw new Error("aud");
  if (!Number.isFinite(c.exp) || c.exp < now - 60) throw new Error("exp");
  if (!Number.isFinite(c.iat) || c.iat > now + 60 || now - c.iat > MAX_AGE_SEC) throw new Error("iat");
  if (typeof c.nonce !== "string" || !c.nonce) throw new Error("nonce");
  return c;
}

// Ключи Telegram: кэш на час; при неизвестном ключе один раз перечитываем. В тестах подменяются через setJwksProvider.
let provider = null, cache = null;
function setJwksProvider(f) { provider = f; cache = null; }
async function loadJwks(force) {
  if (provider) return provider();
  if (!force && cache && Date.now() - cache.at < 3600000) return cache.jwks;
  const res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error("jwks");
  cache = { at: Date.now(), jwks: await res.json() };
  return cache.jwks;
}

function install(k) {
  const { route, HttpError, V, S, createSession, tooMany, noteAttempt } = k;
  const enabled = () => !!clientIdOf();
  // Одноразовое значение привязано к браузеру, который его запросил: в cookie лежит его хэш. Чужой перехваченный id_token без этой cookie не сработает.
  const NONCE_COOKIE = "fw_tgn";
  const nonceHash = n => crypto.createHash("sha256").update(String(n)).digest("base64url");
  const nonceCookie = (v, secure, age) => NONCE_COOKIE + "=" + v + "; HttpOnly; SameSite=Lax; Path=/api/auth/telegram; Max-Age=" + age + (secure ? "; Secure" : "");

  // Публичные настройки страницы: Client ID бота (публичное число), если вход включён.
  route("GET", "/api/config", async () => ({ status: 200, body: { telegramEnabled: enabled(), telegramClientId: enabled() ? Number(clientIdOf()) : null } }));

  // Одноразовое значение, которое страница передаёт Telegram и которое попадёт в id_token: так украденный токен нельзя использовать повторно.
  route("POST", "/api/auth/telegram/nonce", async ctx => {
    if (!enabled()) throw new HttpError(503, "Вход через Telegram ещё не настроен");
    const { db, ip } = ctx;
    if (await tooMany(db, ["tgn:" + ip], 60, 15)) throw new HttpError(429, "Слишком много попыток, подождите");
    await noteAttempt(db, ["tgn:" + ip]);
    await db.query("DELETE FROM login_nonces WHERE created_at < now() - interval '15 minutes'");
    const nonce = crypto.randomBytes(16).toString("base64url");
    await db.query("INSERT INTO login_nonces(nonce) VALUES ($1)", [nonce]);
    return { status: 200, body: { nonce }, cookies: [nonceCookie(nonceHash(nonce), ctx.secure, 900)] };
  });

  route("POST", "/api/auth/telegram", async ctx => {
    if (!enabled()) throw new HttpError(503, "Вход через Telegram ещё не настроен");
    const { db, body, ip } = ctx, deny = () => new HttpError(401, "Не удалось подтвердить вход через Telegram");
    if (await tooMany(db, ["tg:" + ip], 30, 15)) throw new HttpError(429, "Слишком много попыток, подождите");
    const nowSec = Math.floor(ctx.now.getTime() / 1000);
    let claims;
    try {
      claims = verifyIdToken(body.id_token, { clientId: clientIdOf(), jwks: await loadJwks(false), nowSec });
    } catch (e) {
      if (e.message === "kid" && !provider) { try { claims = verifyIdToken(body.id_token, { clientId: clientIdOf(), jwks: await loadJwks(true), nowSec }); } catch (e2) { /* ниже отказ */ } }
      if (!claims) { await noteAttempt(db, ["tg:" + ip]); throw deny(); }
    }
    if (typeof claims.nonce !== "string" || ctx.cookies[NONCE_COOKIE] !== nonceHash(claims.nonce)) { await noteAttempt(db, ["tg:" + ip]); throw new HttpError(401, "Вход устарел, нажмите кнопку ещё раз"); }
    const used = await db.query("DELETE FROM login_nonces WHERE nonce = $1 AND created_at > now() - interval '15 minutes' RETURNING nonce", [claims.nonce]);
    if (!used.length) { await noteAttempt(db, ["tg:" + ip]); throw new HttpError(401, "Вход устарел, нажмите кнопку ещё раз"); }
    const tgId = String(claims.id !== undefined ? claims.id : claims.sub);
    if (!/^[0-9]{1,15}$/.test(tgId)) throw deny();
    const username = typeof claims.preferred_username === "string" && /^[A-Za-z0-9_]{3,32}$/.test(claims.preferred_username) ? claims.preferred_username : null;
    let name = V.str(String(claims.name || claims.given_name || "").replace(/\s+/g, " "), 1, 30);
    if (!name || name.length < 2) name = "Игрок" + tgId.slice(-4);

    // Уже вошедший человек привязывает Telegram к своему аккаунту; иначе вход или создание аккаунта.
    if (ctx.user) {
      const taken = await db.query("SELECT id FROM users WHERE telegram_id = $1::bigint AND id <> $2", [tgId, ctx.user.id]);
      if (taken.length) throw new HttpError(409, "Этот Telegram уже привязан к другому аккаунту");
      await db.query("UPDATE users SET telegram_id = $1::bigint, telegram_username = $2 WHERE id = $3", [tgId, username, ctx.user.id]);
      return { status: 200, body: { linked: true }, cookies: [nonceCookie("", ctx.secure, 0)] };
    }
    let rows = await db.query("SELECT id, display_name, role, rating_opt_in FROM users WHERE telegram_id = $1::bigint", [tgId]);
    let created = false;
    if (!rows.length) {
      try {
        rows = await db.query("INSERT INTO users(telegram_id, telegram_username, display_name) VALUES ($1::bigint, $2, $3) RETURNING id, display_name, role, rating_opt_in", [tgId, username, name]);
        created = true;
      } catch (e) {
        if (!(e && (e.code === "23505" || /duplicate key|unique/i.test(String(e.message))))) throw e;
        rows = await db.query("SELECT id, display_name, role, rating_opt_in FROM users WHERE telegram_id = $1::bigint", [tgId]); // одновременный вход
      }
      if (created) await db.query("INSERT INTO profiles(user_id) VALUES ($1) ON CONFLICT DO NOTHING", [rows[0].id]);
    } else if (username) await db.query("UPDATE users SET telegram_username = $1 WHERE id = $2", [username, rows[0].id]);
    const u = rows[0], tok = await createSession(db, u.id);
    return { status: created ? 201 : 200, body: { user: { name: u.display_name, role: u.role, ratingOptIn: !!u.rating_opt_in }, created }, cookies: [S.sessionCookie(tok, { secure: ctx.secure }), nonceCookie("", ctx.secure, 0)] };
  });
}
module.exports = { install, verifyIdToken, setJwksProvider, decodeJwt, ISSUER, clientIdOf };
