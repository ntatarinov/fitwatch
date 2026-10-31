// Серверные правила FitWatch: аккаунты, данные тела, очки и бонусы за тренировки, рейтинг.
// handle(req, opts) не зависит от Vercel: принимает описание запроса и возвращает { status, body, cookies }.
const { getDb } = require("./db");
const S = require("./security");
const V = require("./validate");

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const bad = m => new HttpError(400, m);

const GOALS = ["lose", "muscle", "strength", "endurance", "health", "flex"];
const PLACES = ["home", "dumbbells", "gym"];
const LIMITS = ["knees", "back", "shoulders", "wrists", "heart"];
const STREAK_GAP = 2;

// ---- очки и бонусы ----
const basePoints = program => (program === "stretch" ? 10 : 20);
const bonusFor = streak => (streak >= 7 ? 10 : streak >= 3 ? 5 : 0);

// prevDesc — номера дней прошлых тренировок по убыванию (раньше day); считаем серию вместе с днём day.
function streakWith(day, prevDesc) {
  let n = 1, last = day;
  for (const p of prevDesc) { if (last - p <= STREAK_GAP) { n++; last = p; } else break; }
  return n;
}
// Текущая серия на сегодня: если с последней тренировки прошло больше STREAK_GAP дней, серия сгорела.
function currentStreak(todayNum, daysDesc) {
  if (!daysDesc.length || todayNum - daysDesc[0] > STREAK_GAP) return 0;
  return streakWith(daysDesc[0], daysDesc.slice(1));
}

async function prevDays(db, userId, dayStr, limit) {
  const rows = await db.query("SELECT day::text AS day FROM workouts WHERE user_id = $1 AND day < $2::date ORDER BY day DESC LIMIT $3", [userId, dayStr, limit || 12]);
  return rows.map(r => V.dayNum(r.day));
}

async function insertWorkout(db, userId, w, opts) {
  const prev = await prevDays(db, userId, w.day, 12);
  const streak = streakWith(V.dayNum(w.day), prev), base = basePoints(w.program), bonus = opts && opts.noBonus ? 0 : bonusFor(streak);
  const rows = await db.query(
    `INSERT INTO workouts(user_id, day, program, day_id, title, base_points, bonus_points)
     VALUES ($1, $2::date, $3, $4, $5, $6, $7) ON CONFLICT (user_id, day) DO NOTHING RETURNING id`,
    [userId, w.day, w.program, w.dayId, w.title, base, bonus]);
  return rows.length ? { base, bonus, streak, total: base + bonus } : null;
}

// ---- сессии ----
async function createSession(db, userId) {
  const token = S.newToken();
  await db.query("INSERT INTO sessions(token_hash, user_id, expires_at) VALUES ($1, $2, now() + ($3::text || ' days')::interval)", [S.tokenHash(token), userId, String(S.DAYS)]);
  return token;
}
async function userFromCookie(db, cookies) {
  const t = cookies[S.COOKIE];
  if (!t) return null;
  const rows = await db.query(
    `SELECT u.id, u.email, u.display_name, u.role, u.rating_opt_in, u.telegram_id, u.telegram_username, (u.password_hash IS NOT NULL) AS has_password
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()`, [S.tokenHash(t)]);
  if (!rows.length) return null;
  const u = rows[0];
  return { id: u.id, email: u.email, name: u.display_name, role: u.role, ratingOptIn: !!u.rating_opt_in,
    telegramId: u.telegram_id == null ? null : String(u.telegram_id), telegramUsername: u.telegram_username || null, hasPassword: !!u.has_password };
}
// Администратор определяется только по подтверждённой личности: Telegram ID (его подтверждает Telegram) или ID аккаунта.
// Почта не годится: её никто не подтверждает, и чужую ещё не зарегистрированную почту мог бы занять кто угодно.
const envList = name => String(process.env[name] || "").toLowerCase().split(",").map(x => x.trim()).filter(Boolean);
const isAdmin = u => !!u && !!((u.telegramId && envList("ADMIN_TELEGRAM_IDS").includes(String(u.telegramId))) || (u.id && envList("ADMIN_USER_IDS").includes(String(u.id).toLowerCase())));
const publicUser = u => ({ email: u.email || null, name: u.name, role: u.role, ratingOptIn: u.ratingOptIn, isAdmin: isAdmin(u),
  telegram: u.telegramId ? { linked: true, username: u.telegramUsername } : { linked: false }, hasPassword: !!u.hasPassword });

// Тариф человека: free, premium или personal; действует до даты until.
const TIER_RANK = { free: 0, premium: 1, personal: 2 };
async function tierOf(db, userId) {
  const r = await db.query("SELECT tier, until FROM subscriptions WHERE user_id = $1 AND until > now()", [userId]);
  return r.length ? { tier: r[0].tier, until: new Date(r[0].until).toISOString() } : { tier: "free", until: null };
}

async function tooMany(db, keys, limit, minutes) {
  const rows = await db.query(
    "SELECT count(*)::int AS n FROM login_attempts WHERE key = ANY($1::text[]) AND at > now() - ($2::text || ' minutes')::interval", [keys, String(minutes)]);
  return Number(rows[0].n) >= limit;
}
const noteAttempt = (db, keys) => db.query("INSERT INTO login_attempts(key) SELECT unnest($1::text[])", [keys]);

// ---- профиль ----
const PROFILE_COLS = ["goal", "level", "days", "minutes", "place", "limits", "sex", "age", "height_cm", "weight_kg"];
function parseProfile(p) {
  const out = {};
  if (p == null) return out;
  if (typeof p !== "object") throw bad("Неверные данные профиля");
  const take = (key, col, fn, msg) => { if (key in p) { if (p[key] === null) { out[col] = null; return; } const v = fn(p[key]); if (v === null) throw bad(msg); out[col] = v; } };
  take("goal", "goal", v => V.oneOf(v, GOALS), "Неверная цель");
  take("level", "level", v => V.int(v, 1, 3), "Неверный уровень");
  take("days", "days", v => V.int(v, 2, 6), "Дней в неделю: от 2 до 6");
  take("minutes", "minutes", v => V.oneOf(Number(v), [15, 30, 45, 60]), "Минут: 15, 30, 45 или 60");
  take("place", "place", v => V.oneOf(v, PLACES), "Неверное место");
  take("sex", "sex", v => V.oneOf(v, ["m", "f"]), "Неверный пол");
  take("age", "age", v => V.int(v, 14, 90), "Возраст: от 14 до 90");
  take("height", "height_cm", v => V.num(v, 120, 230), "Рост: от 120 до 230 см");
  take("weight", "weight_kg", v => V.num(v, 30, 300), "Вес: от 30 до 300 кг");
  if ("limits" in p) {
    if (!Array.isArray(p.limits) || p.limits.some(l => !LIMITS.includes(l))) throw bad("Неверные ограничения");
    out.limits = Array.from(new Set(p.limits));
  }
  return out;
}
const profileOut = r => !r ? {} : {
  goal: r.goal, level: r.level, days: r.days, minutes: r.minutes, place: r.place, limits: r.limits || [], sex: r.sex, age: r.age,
  height: r.height_cm == null ? null : Number(r.height_cm), weight: r.weight_kg == null ? null : Number(r.weight_kg),
};
async function saveProfile(db, userId, fields) {
  const cols = Object.keys(fields);
  if (!cols.length) return;
  const sets = cols.map((c, i) => `${c} = $${i + 2}`).join(", ");
  const names = ["user_id"].concat(cols).join(", "), ph = cols.map((_, i) => "$" + (i + 2)).join(", ");
  await db.query(`INSERT INTO profiles(${names}) VALUES ($1, ${ph}) ON CONFLICT (user_id) DO UPDATE SET ${sets}, updated_at = now()`, [userId].concat(cols.map(c => fields[c])));
}

// ---- маршруты ----
const routes = [];
const route = (method, pattern, fn) => routes.push({ method, re: new RegExp("^" + pattern.replace(/:uuid/g, "([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})").replace(/:id/g, "([0-9]{1,15})") + "$"), fn });
const needUser = ctx => { if (!ctx.user) throw new HttpError(401, "Нужно войти"); return ctx.user; };

route("GET", "/api/health", async ctx => ({ status: 200, body: { ok: true, db: true, time: ctx.now.toISOString() } }));

route("POST", "/api/auth/register", async ctx => {
  const { db, body, ip } = ctx;
  const email = V.email(body.email), name = V.str(body.name, 2, 30), pw = typeof body.password === "string" ? body.password : "";
  if (!email) throw bad("Проверьте электронную почту");
  if (!name) throw bad("Имя: от 2 до 30 символов");
  if (pw.length < 8 || pw.length > 128) throw bad("Пароль: от 8 до 128 символов");
  if (await tooMany(db, ["reg:" + ip], 20, 60)) throw new HttpError(429, "Слишком много попыток, подождите");
  await noteAttempt(db, ["reg:" + ip]);
  let rows;
  try {
    rows = await db.query("INSERT INTO users(email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id", [email, await S.hashPassword(pw), name]);
  } catch (e) {
    if (e && (e.code === "23505" || /duplicate key|unique/i.test(String(e.message)))) throw new HttpError(409, "Эта почта уже зарегистрирована");
    throw e;
  }
  const id = rows[0].id;
  await db.query("INSERT INTO profiles(user_id) VALUES ($1) ON CONFLICT DO NOTHING", [id]);
  const token = await createSession(db, id);
  return { status: 201, body: { user: { email, name, role: "client", ratingOptIn: false } }, cookies: [S.sessionCookie(token, { secure: ctx.secure })] };
});

route("POST", "/api/auth/login", async ctx => {
  const { db, body, ip } = ctx;
  const email = V.email(body.email), pw = typeof body.password === "string" ? body.password : "";
  const keys = ["ip:" + ip].concat(email ? ["email:" + email] : []);
  // С одного адреса — 10 попыток. На одну почту со всех адресов — 50: иначе чужие неверные пароли блокировали бы хозяина почты.
  if (await tooMany(db, ["ip:" + ip], 10, 15) || (email && await tooMany(db, ["email:" + email], 50, 15))) throw new HttpError(429, "Слишком много попыток входа, подождите 15 минут");
  const rows = email ? await db.query("SELECT id, password_hash, display_name, role, rating_opt_in FROM users WHERE email = $1", [email]) : [];
  const ok = rows.length ? await S.verifyPassword(pw, rows[0].password_hash) : (await S.verifyPassword(pw, "x"), false);
  if (!ok) { await noteAttempt(db, keys); throw new HttpError(401, "Неверная почта или пароль"); }
  const u = rows[0], token = await createSession(db, u.id);
  return { status: 200, body: { user: { email, name: u.display_name, role: u.role, ratingOptIn: !!u.rating_opt_in } }, cookies: [S.sessionCookie(token, { secure: ctx.secure })] };
});

route("POST", "/api/auth/logout", async ctx => {
  const t = ctx.cookies[S.COOKIE];
  if (t) await ctx.db.query("DELETE FROM sessions WHERE token_hash = $1", [S.tokenHash(t)]);
  return { status: 200, body: { ok: true }, cookies: [S.clearCookie({ secure: ctx.secure })] };
});

async function me(ctx) {
  const u = needUser(ctx), { db } = ctx;
  const p = await db.query("SELECT * FROM profiles WHERE user_id = $1", [u.id]);
  const st = await db.query("SELECT COALESCE(SUM(base_points + bonus_points), 0)::int AS points, count(*)::int AS workouts FROM workouts WHERE user_id = $1", [u.id]);
  const days = (await db.query("SELECT day::text AS day FROM workouts WHERE user_id = $1 ORDER BY day DESC LIMIT 60", [u.id])).map(r => V.dayNum(r.day));
  const tr = await db.query("SELECT status FROM trainer_profiles WHERE user_id = $1", [u.id]);
  return { status: 200, body: { user: Object.assign(publicUser(u), { isTrainer: !!tr.length && tr[0].status === "approved" }), profile: profileOut(p[0]), stats: { points: Number(st[0].points), workouts: Number(st[0].workouts), streak: currentStreak(ctx.todayNum, days) } } };
}
route("GET", "/api/me", me);

route("PATCH", "/api/me", async ctx => {
  const u = needUser(ctx), { db, body } = ctx;
  if (body.name !== undefined) { const n = V.str(body.name, 2, 30); if (!n) throw bad("Имя: от 2 до 30 символов"); await db.query("UPDATE users SET display_name = $1 WHERE id = $2", [n, u.id]); }
  if (body.ratingOptIn !== undefined) { if (typeof body.ratingOptIn !== "boolean") throw bad("Неверное значение"); await db.query("UPDATE users SET rating_opt_in = $1 WHERE id = $2", [body.ratingOptIn, u.id]); }
  if (body.profile !== undefined) await saveProfile(db, u.id, parseProfile(body.profile));
  ctx.user = await userFromCookie(db, ctx.cookies);
  return me(ctx);
});

route("DELETE", "/api/me", async ctx => {
  const u = needUser(ctx), { db, body } = ctx;
  if (u.hasPassword) {
    const rows = await db.query("SELECT password_hash FROM users WHERE id = $1", [u.id]);
    if (!(await S.verifyPassword(typeof body.password === "string" ? body.password : "", rows[0].password_hash))) throw new HttpError(403, "Неверный пароль");
  } else if (body.confirm !== "DELETE") throw new HttpError(403, "Подтвердите удаление");
  await db.query("DELETE FROM users WHERE id = $1", [u.id]); // сессии, профиль, замеры и тренировки удаляются каскадом
  return { status: 200, body: { ok: true }, cookies: [S.clearCookie({ secure: ctx.secure })] };
});

// ---- вес и рост ----
route("GET", "/api/measurements", async ctx => {
  const u = needUser(ctx);
  const kind = V.oneOf(ctx.query.kind || "weight", ["weight", "height"]);
  if (!kind) throw bad("Неверный вид замера");
  const rows = await ctx.db.query("SELECT id, value, measured_on::text AS day FROM measurements WHERE user_id = $1 AND kind = $2 ORDER BY measured_on DESC LIMIT 400", [u.id, kind]);
  rows.reverse(); // последние 400 замеров, по возрастанию даты
  return { status: 200, body: { kind, items: rows.map(r => ({ id: Number(r.id), value: Number(r.value), day: r.day })) } };
});

route("POST", "/api/measurements", async ctx => {
  const u = needUser(ctx), { db, body } = ctx;
  const kind = V.oneOf(body.kind, ["weight", "height"]);
  if (!kind) throw bad("Вид замера: weight или height");
  const value = kind === "weight" ? V.num(body.value, 30, 300) : V.num(body.value, 120, 230);
  if (value === null) throw bad(kind === "weight" ? "Вес: от 30 до 300 кг" : "Рост: от 120 до 230 см");
  const day = body.day === undefined ? ctx.today : body.day;
  const dn = V.dayNum(day);
  if (dn === null || dn > ctx.todayNum + 1 || dn < ctx.todayNum - 365) throw bad("Дата замера: не раньше года назад и не позже завтра");
  const rows = await db.query(
    `INSERT INTO measurements(user_id, kind, value, measured_on) VALUES ($1, $2, $3, $4::date)
     ON CONFLICT (user_id, kind, measured_on) DO UPDATE SET value = EXCLUDED.value RETURNING id`, [u.id, kind, value, day]);
  const col = kind === "weight" ? "weight_kg" : "height_cm";
  await db.query(
    `INSERT INTO profiles(user_id, ${col}) SELECT $1::uuid, value FROM measurements WHERE user_id = $1::uuid AND kind = $2::text ORDER BY measured_on DESC LIMIT 1
     ON CONFLICT (user_id) DO UPDATE SET ${col} = EXCLUDED.${col}, updated_at = now()`, [u.id, kind]);
  return { status: 201, body: { id: Number(rows[0].id), kind, value, day } };
});

route("DELETE", "/api/measurements/:id", async ctx => {
  const u = needUser(ctx);
  const r = await ctx.db.query("DELETE FROM measurements WHERE id = $1 AND user_id = $2 RETURNING kind", [Number(ctx.params[0]), u.id]);
  if (!r.length) throw new HttpError(404, "Замер не найден");
  // В профиле остаётся последний оставшийся замер (или пусто), а не удалённый.
  const col = r[0].kind === "weight" ? "weight_kg" : "height_cm";
  await ctx.db.query(`UPDATE profiles SET ${col} = (SELECT value FROM measurements WHERE user_id = $1 AND kind = $2 ORDER BY measured_on DESC LIMIT 1), updated_at = now() WHERE user_id = $1`, [u.id, r[0].kind]);
  return { status: 200, body: { ok: true } };
});

// ---- тренировки, очки, бонусы ----
function parseWorkout(w) {
  if (!w || typeof w !== "object") return null;
  const day = typeof w.day === "string" && V.dayNum(w.day) !== null ? w.day : null;
  const program = V.slug(w.program), dayId = V.slug(w.dayId);
  if (!day || !program || !dayId) return null;
  let title = null;
  if (w.title !== undefined && w.title !== null) { title = V.str(String(w.title), 1, 80); if (!title) return null; }
  return { day, program, dayId, title };
}

route("POST", "/api/workouts", async ctx => {
  const u = needUser(ctx);
  const w = parseWorkout(ctx.body);
  if (!w) throw bad("Неверные данные тренировки");
  const dn = V.dayNum(w.day);
  if (dn > ctx.todayNum + 1 || dn < ctx.todayNum - 1) throw bad("Тренировку можно записать за сегодня или вчера");
  const r = await insertWorkout(ctx.db, u.id, w);
  if (!r) throw new HttpError(409, "На этот день тренировка уже записана");
  return { status: 201, body: { day: w.day, points: r.base, bonus: r.bonus, total: r.total, streak: r.streak } };
});

// Перенос истории из браузера: один раз на аккаунт, только последние 14 дней, без бонусов за серию.
// История из браузера ничем не подтверждена, поэтому её вклад в рейтинг ограничен; новые тренировки идут через /api/workouts.
const SYNC_DAYS = 14;
route("POST", "/api/workouts/sync", async ctx => {
  const u = needUser(ctx);
  const items = Array.isArray(ctx.body.items) ? ctx.body.items : null;
  if (!items || items.length > 60) throw bad("Нужен список до 60 тренировок");
  const first = await ctx.db.query("UPDATE users SET history_synced_at = now() WHERE id = $1 AND history_synced_at IS NULL RETURNING id", [u.id]);
  if (!first.length) return { status: 200, body: { added: 0, skipped: items.length, points: 0, already: true } };
  const list = items.map(parseWorkout).filter(Boolean).filter(w => { const d = V.dayNum(w.day); return d <= ctx.todayNum && d > ctx.todayNum - SYNC_DAYS; });
  list.sort((a, b) => (a.day < b.day ? -1 : 1));
  let added = 0, points = 0;
  for (const w of list) { const r = await insertWorkout(ctx.db, u.id, w, { noBonus: true }); if (r) { added++; points += r.total; } }
  return { status: 200, body: { added, skipped: items.length - added, points } };
});

route("GET", "/api/workouts", async ctx => {
  const u = needUser(ctx);
  const rows = await ctx.db.query("SELECT day::text AS day, program, day_id, title, base_points, bonus_points FROM workouts WHERE user_id = $1 ORDER BY day DESC LIMIT 60", [u.id]);
  return { status: 200, body: { items: rows.map(r => ({ day: r.day, program: r.program, dayId: r.day_id, title: r.title, points: Number(r.base_points), bonus: Number(r.bonus_points) })) } };
});

// ---- рейтинг (только тем, кто согласился) ----
function periodStart(period, todayNum) {
  if (period === "all") return null;
  if (period === "week") return V.dayStr(todayNum - ((todayNum + 4) % 7 + 6) % 7); // понедельник
  const d = new Date(todayNum * 86400000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10); // month
}
route("GET", "/api/leaderboard", async ctx => {
  const period = V.oneOf(ctx.query.period || "week", ["week", "month", "all"]);
  if (!period) throw bad("Период: week, month или all");
  const since = periodStart(period, ctx.todayNum);
  const me = ctx.user ? ctx.user.id : null;
  const rows = await ctx.db.query(
    `WITH t AS (
       SELECT u.id, u.display_name AS name, COALESCE(SUM(w.base_points + w.bonus_points), 0)::int AS points, count(w.id)::int AS workouts
       FROM users u LEFT JOIN workouts w ON w.user_id = u.id AND ($1::date IS NULL OR w.day >= $1::date)
       WHERE u.rating_opt_in GROUP BY u.id, u.display_name
     ), r AS (SELECT t.*, (RANK() OVER (ORDER BY points DESC))::int AS rank FROM t)
     (SELECT * FROM r ORDER BY rank, workouts DESC, name LIMIT 20)
     UNION (SELECT * FROM r WHERE id = $2::uuid)
     ORDER BY rank, workouts DESC, name`, [since, me]);
  return { status: 200, body: { period, since, items: rows.map(r => ({ rank: Number(r.rank), name: r.name, points: Number(r.points), workouts: Number(r.workouts), me: me !== null && r.id === me })) } };
});

// ---- тарифы и тренеры (отдельные модули, общий набор помощников) ----
const kit = { route, HttpError, bad, needUser, V, S, tierOf, TIER_RANK, isAdmin, createSession, tooMany, noteAttempt };
require("./telegram").install(kit);
require("./subscriptions").install(kit);
require("./trainers").install(kit);
require("./coach").install(kit);

// ---- вход в обработку ----
async function handle(req, opts) {
  opts = opts || {};
  const now = opts.now || new Date();
  const method = String(req.method || "GET").toUpperCase();
  const path = String(req.path || "/").split("?")[0].replace(/\/+$/, "") || "/";
  const headers = {};
  Object.keys(req.headers || {}).forEach(k => { headers[k.toLowerCase()] = req.headers[k]; });
  const secure = opts.secure !== undefined ? opts.secure : (headers["x-forwarded-proto"] || "https") === "https";
  const out = (status, body, cookies) => ({ status, body, cookies: cookies || [], headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  try {
    const found = routes.map(r => ({ r, m: path.match(r.re) })).filter(x => x.m && x.r.method === method)[0];
    if (!found) return out(routes.some(r => r.re.test(path)) ? 405 : 404, { error: "Не найдено" });
    if (method !== "GET" && method !== "HEAD") {
      if (headers["x-fw"] !== "1") return out(403, { error: "Запрос отклонён" });
      const origin = headers.origin, host = headers.host;
      if (origin && host) { let oh = ""; try { oh = new URL(origin).host; } catch (e) { /* неверный Origin */ } if (oh !== host) return out(403, { error: "Запрос отклонён" }); }
    }
    const db = opts.db || await getDb();
    const todayStr = now.toISOString().slice(0, 10);
    const ctx = {
      db, req, now, today: todayStr, todayNum: V.dayNum(todayStr), secure, params: found.m.slice(1),
      body: req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {}, query: req.query || {},
      cookies: S.parseCookies(headers.cookie), ip: String(headers["x-forwarded-for"] || req.ip || "local").split(",")[0].trim(),
    };
    ctx.user = await userFromCookie(db, ctx.cookies);
    const res = await found.r.fn(ctx);
    return out(res.status, res.body, res.cookies);
  } catch (e) {
    if (e instanceof HttpError) return out(e.status, { error: e.message });
    if (e && e.code === "NO_DB") return out(503, { error: "Сервер данных ещё не подключён" });
    // Ошибки формата данных от базы (не тот тип, вне диапазона, нарушено ограничение, недопустимый символ) — это неверный запрос, а не сбой сервера.
    if (e && ["22P02", "22003", "23514", "22021", "22001"].includes(e.code)) return out(400, { error: "Неверные данные" });
    console.error("api error:", e && e.message);
    return out(500, { error: "Ошибка сервера" });
  }
}

module.exports = { handle, streakWith, currentStreak, bonusFor, basePoints, periodStart };
