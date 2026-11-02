// Тренировки с подходами: упражнения, повторения, вес. Тоннаж и число подходов считает сервер, а не присланное число.
// Идентификатор тренировки создаёт устройство (uuid), поэтому повторная отправка безопасна. Тренеру тренировки показывает
// кабинет (coach.js) только при согласии клиента на результаты.
const MAX_ITEMS = 20, MAX_SETS_PER_ITEM = 30, MAX_SETS = 200, PER_DAY = 10, BACK_DAYS = 14;

function install(k) {
  const { route, HttpError, bad, needUser, V } = k;

  // Проверка и приведение тренировки. Возвращает чистый объект или бросает 400 с понятным текстом.
  function parse(b) {
    if (!b || typeof b !== "object") throw bad("Неверные данные тренировки");
    const id = typeof b.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.id) ? b.id.toLowerCase() : null;
    if (!id) throw bad("Нужен идентификатор тренировки (uuid)");
    const title = V.str(b.title, 1, 80);
    if (!title) throw bad("Название тренировки: от 1 до 80 символов");
    const dur = V.int(b.durationSec, 0, 86400);
    if (dur === null) throw bad("Длительность: от 0 до 24 часов");
    const program = b.program === undefined || b.program === null ? null : V.slug(b.program);
    const dayId = b.dayId === undefined || b.dayId === null ? null : V.slug(b.dayId);
    if ((b.program != null && !program) || (b.dayId != null && !dayId)) throw bad("Неверная программа");
    if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > MAX_ITEMS) throw bad("Упражнений в тренировке: от 1 до " + MAX_ITEMS);
    let total = 0, sets = 0, kg = 0;
    const items = b.items.map(it => {
      if (!it || typeof it !== "object") throw bad("Неверное упражнение");
      const ex = V.slug(it.ex), name = V.str(it.name, 1, 60);
      if (!ex || !name) throw bad("У упражнения нужны код и название");
      if (!Array.isArray(it.sets) || it.sets.length < 1 || it.sets.length > MAX_SETS_PER_ITEM) throw bad("Подходов в упражнении: от 1 до " + MAX_SETS_PER_ITEM);
      const clean = it.sets.map(s => {
        const reps = s && V.int(s.reps, 1, 1000), w = s && (s.kg === undefined || s.kg === null || s.kg === "" ? 0 : V.num(s.kg, 0, 1000));
        if (reps === null || reps === undefined || w === null || w === undefined) throw bad("Подход: повторения от 1 до 1000, вес от 0 до 1000 кг");
        return { reps, kg: w };
      });
      total += clean.length;
      clean.forEach(s => { sets++; kg += s.reps * s.kg; });
      return { ex, name, sets: clean };
    });
    if (total > MAX_SETS) throw bad("Подходов в тренировке не больше " + MAX_SETS);
    const rpe = b.rpe === undefined || b.rpe === null ? null : V.int(b.rpe, 1, 10);
    if (rpe === undefined || (b.rpe != null && rpe === null)) throw bad("Тяжесть тренировки: число от 1 до 10");
    return { id, title, durationSec: dur, program, dayId, items, sets, tonnage: Math.round(kg * 10) / 10, rpe };
  }
  const out = r => ({ id: r.id, date: r.day, startedAt: r.started_at || null, durationSec: r.duration_sec, title: r.title, program: r.program, dayId: r.day_id,
    items: r.items, sets: r.sets, tonnage: Number(r.tonnage_kg), rpe: r.rpe === null || r.rpe === undefined ? null : Number(r.rpe) });
  const COLS = "id, day::text AS day, started_at::text AS started_at, duration_sec, title, program, day_id, items, tonnage_kg, sets, rpe";

  route("POST", "/api/sessions", async ctx => {
    const u = needUser(ctx), { db } = ctx, s = parse(ctx.body);
    const day = ctx.body.day === undefined ? ctx.today : ctx.body.day, dn = V.dayNum(day);
    if (dn === null || dn > ctx.todayNum + 1 || dn < ctx.todayNum - BACK_DAYS) throw bad("Дата тренировки: не старше " + BACK_DAYS + " дней и не позже завтра");
    const started = typeof ctx.body.startedAt === "string" && !Number.isNaN(Date.parse(ctx.body.startedAt)) ? new Date(ctx.body.startedAt).toISOString() : null;
    const n = await db.query("SELECT count(*)::int AS n FROM workout_sessions WHERE user_id = $1 AND day = $2::date", [u.id, day]);
    const own = await db.query("SELECT user_id FROM workout_sessions WHERE id = $1", [s.id]);
    if (own.length) { // повторная отправка той же тренировки: ничего не меняем, чужой id не раскрываем
      if (own[0].user_id !== u.id) throw new HttpError(409, "Идентификатор уже занят");
      return { status: 200, body: { id: s.id, already: true, sets: s.sets, tonnage: s.tonnage } };
    }
    if (Number(n[0].n) >= PER_DAY) throw new HttpError(429, "Не больше " + PER_DAY + " тренировок в день");
    try {
      await db.query(
        `INSERT INTO workout_sessions(id, user_id, day, started_at, duration_sec, title, program, day_id, items, tonnage_kg, sets, rpe)
         VALUES ($1, $2, $3::date, $4::timestamptz, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)`,
        [s.id, u.id, day, started, s.durationSec, s.title, s.program, s.dayId, JSON.stringify(s.items), s.tonnage, s.sets, s.rpe]);
    } catch (e) {
      if (e && (e.code === "23505" || /duplicate key|unique/i.test(String(e.message)))) return { status: 200, body: { id: s.id, already: true, sets: s.sets, tonnage: s.tonnage } };
      throw e;
    }
    return { status: 201, body: { id: s.id, date: day, sets: s.sets, tonnage: s.tonnage } };
  });

  // Свои тренировки: для нового устройства и для сверки. Сначала новые.
  route("GET", "/api/sessions", async ctx => {
    const u = needUser(ctx);
    const limit = V.int(ctx.query.limit === undefined ? 100 : ctx.query.limit, 1, 300);
    if (limit === null) throw bad("Количество: от 1 до 300");
    const rows = await ctx.db.query(`SELECT ${COLS} FROM workout_sessions WHERE user_id = $1 ORDER BY day DESC, created_at DESC LIMIT ${limit}`, [u.id]);
    return { status: 200, body: { items: rows.map(out) } };
  });

  route("DELETE", "/api/sessions/:uuid", async ctx => {
    const u = needUser(ctx);
    const r = await ctx.db.query("DELETE FROM workout_sessions WHERE id = $1 AND user_id = $2 RETURNING id", [ctx.params[0].toLowerCase(), u.id]);
    if (!r.length) throw new HttpError(404, "Тренировка не найдена");
    return { status: 200, body: { ok: true } };
  });
}
module.exports = { install, MAX_ITEMS, MAX_SETS, PER_DAY, BACK_DAYS };
