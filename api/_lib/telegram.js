// Вход через Telegram (Login Widget). Сервер проверяет подпись данных секретным токеном бота: подделать вход нельзя.
// Токен берётся из окружения Vercel (TELEGRAM_BOT_TOKEN) и никуда не отправляется; имя бота (TELEGRAM_BOT_USERNAME) публичное.
const crypto = require("crypto");

const MAX_AGE_SEC = 86400; // данные входа действуют сутки
// data — объект от виджета {id, first_name, auth_date, hash, ...}. Возвращает true, если подпись верна и данные свежие.
function verifyTelegram(data, token, nowSec) {
  if (!data || typeof data !== "object" || typeof data.hash !== "string" || !/^[0-9a-f]{64}$/.test(data.hash)) return false;
  const check = Object.keys(data).filter(k => k !== "hash" && data[k] !== undefined && data[k] !== null).sort().map(k => k + "=" + data[k]).join("\n");
  const secret = crypto.createHash("sha256").update(String(token)).digest();
  const want = crypto.createHmac("sha256", secret).update(check).digest();
  const got = Buffer.from(data.hash, "hex");
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return false;
  const at = Number(data.auth_date);
  if (!Number.isInteger(at)) return false;
  const now = nowSec === undefined ? Math.floor(Date.now() / 1000) : nowSec;
  return now - at <= MAX_AGE_SEC && at - now <= 300;
}

function install(k) {
  const { route, HttpError, bad, V, S, createSession, tooMany, noteAttempt } = k;

  // Публичные настройки для страницы: имя бота (если вход через Telegram включён).
  route("GET", "/api/config", async () => ({ status: 200, body: { telegramBot: process.env.TELEGRAM_BOT_USERNAME || null, telegramEnabled: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME) } }));

  route("POST", "/api/auth/telegram", async ctx => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new HttpError(503, "Вход через Telegram ещё не настроен");
    const { db, body, ip } = ctx;
    if (await tooMany(db, ["tg:" + ip], 30, 15)) throw new HttpError(429, "Слишком много попыток, подождите");
    if (!verifyTelegram(body, token, Math.floor(ctx.now.getTime() / 1000))) { await noteAttempt(db, ["tg:" + ip]); throw new HttpError(401, "Не удалось подтвердить вход через Telegram"); }
    const tgId = String(body.id);
    if (!/^[0-9]{1,15}$/.test(tgId)) throw bad("Неверные данные Telegram");
    const username = typeof body.username === "string" && /^[A-Za-z0-9_]{3,32}$/.test(body.username) ? body.username : null;
    let name = V.str(String(body.first_name || ""), 1, 30);
    if (!name || name.length < 2) name = "Игрок" + tgId.slice(-4);

    // Уже вошедший человек привязывает Telegram к своему аккаунту; иначе вход или создание аккаунта.
    if (ctx.user) {
      const taken = await db.query("SELECT id FROM users WHERE telegram_id = $1::bigint AND id <> $2", [tgId, ctx.user.id]);
      if (taken.length) throw new HttpError(409, "Этот Telegram уже привязан к другому аккаунту");
      await db.query("UPDATE users SET telegram_id = $1::bigint, telegram_username = $2 WHERE id = $3", [tgId, username, ctx.user.id]);
      return { status: 200, body: { linked: true } };
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
    return { status: created ? 201 : 200, body: { user: { name: u.display_name, role: u.role, ratingOptIn: !!u.rating_opt_in }, created }, cookies: [S.sessionCookie(tok, { secure: ctx.secure })] };
  });
}
module.exports = { install, verifyTelegram };
