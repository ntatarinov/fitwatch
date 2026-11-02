// Тренировки, которые тренер назначает клиенту: название, заметка и упражнения с подходами и повторениями.
// Назначить можно только клиенту с действующей связью; клиент видит и выполняет только свои. Согласие на результаты здесь не нужно:
// тренер ничего не узнаёт о клиенте, он только отправляет ему задание.
const MAX_ITEMS = 12, MAX_SETS = 10, PER_DAY = 20;

function install(k) {
  const { route, HttpError, bad, needUser, V } = k;

  async function needCoach(ctx) {
    const u = needUser(ctx);
    const r = await ctx.db.query("SELECT status FROM trainer_profiles WHERE user_id = $1", [u.id]);
    if (!r.length || r[0].status !== "approved") throw new HttpError(403, "Назначать тренировки могут подтверждённые тренеры");
    return u;
  }
  async function myLink(ctx, trainerId, id) {
    const r = await ctx.db.query("SELECT id, client_id, status FROM trainer_links WHERE id = $1 AND trainer_id = $2", [Number(id) || 0, trainerId]);
    if (!r.length) throw new HttpError(404, "Не найдено");
    return r[0];
  }
  function parse(b) {
    if (!b || typeof b !== "object") throw bad("Неверные данные");
    const title = V.str(b.title, 1, 80);
    if (!title) throw bad("Название: от 1 до 80 символов");
    const note = b.note === undefined || b.note === null || b.note === "" ? null : V.str(b.note, 1, 500);
    if (b.note && !note) throw bad("Заметка: до 500 символов");
    if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > MAX_ITEMS) throw bad("Упражнений: от 1 до " + MAX_ITEMS);
    const items = b.items.map(it => {
      if (!it || typeof it !== "object") throw bad("Неверное упражнение");
      const ex = V.slug(it.ex), name = V.str(it.name, 1, 60), sets = V.int(it.sets, 1, MAX_SETS), reps = V.str(String(it.reps === undefined || it.reps === null ? "" : it.reps), 1, 12);
      if (!ex || !name || sets === null || sets === undefined || !reps) throw bad("У упражнения нужны код, название, подходы (1–" + MAX_SETS + ") и повторения");
      return { ex, name, sets, reps };
    });
    return { title, note, items };
  }
  const out = r => ({ id: Number(r.id), title: r.title, note: r.note || "", items: r.items, status: r.status, createdAt: r.created, doneAt: r.done || null });
  const COLS = "id, title, note, items, status, created_at::text AS created, done_at::text AS done";

  // ---- тренер ----
  route("POST", "/api/coach/clients/:id/assignments", async ctx => {
    const u = await needCoach(ctx), l = await myLink(ctx, u.id, ctx.params[0]);
    if (l.status !== "active") throw new HttpError(409, "Тренировку можно назначить, пока связь действует");
    const a = parse(ctx.body);
    const n = await ctx.db.query("SELECT count(*)::int AS n FROM trainer_assignments WHERE link_id = $1 AND created_at > now() - interval '1 day'", [l.id]);
    if (Number(n[0].n) >= PER_DAY) throw new HttpError(429, "Сегодня назначено слишком много тренировок");
    const r = await ctx.db.query("INSERT INTO trainer_assignments(link_id, trainer_id, client_id, title, note, items) VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id", [l.id, u.id, l.client_id, a.title, a.note, JSON.stringify(a.items)]);
    return { status: 201, body: { id: Number(r[0].id) } };
  });
  route("GET", "/api/coach/clients/:id/assignments", async ctx => {
    const u = await needCoach(ctx), l = await myLink(ctx, u.id, ctx.params[0]);
    const rows = await ctx.db.query(`SELECT ${COLS} FROM trainer_assignments WHERE link_id = $1 AND trainer_id = $2 ORDER BY id DESC LIMIT 30`, [l.id, u.id]);
    return { status: 200, body: { items: rows.map(out) } };
  });
  route("DELETE", "/api/coach/clients/:id/assignments/:id", async ctx => {
    const u = await needCoach(ctx), l = await myLink(ctx, u.id, ctx.params[0]);
    const r = await ctx.db.query("UPDATE trainer_assignments SET status = 'cancelled' WHERE id = $1 AND link_id = $2 AND trainer_id = $3 AND status = 'new' RETURNING id", [Number(ctx.params[1]) || 0, l.id, u.id]);
    if (!r.length) throw new HttpError(404, "Не найдено или уже выполнено");
    return { status: 200, body: { ok: true } };
  });

  // ---- клиент: только свои и только от действующего тренера ----
  route("GET", "/api/assignments", async ctx => {
    const u = needUser(ctx);
    const rows = await ctx.db.query(
      `SELECT a.id, a.title, a.note, a.items, a.status, a.created_at::text AS created, a.done_at::text AS done, tu.display_name AS trainer_name
       FROM trainer_assignments a JOIN trainer_links l ON l.id = a.link_id JOIN users tu ON tu.id = a.trainer_id
       WHERE a.client_id = $1 AND a.status IN ('new','done') AND l.status = 'active' ORDER BY a.id DESC LIMIT 30`, [u.id]);
    return { status: 200, body: { items: rows.map(r => Object.assign(out(r), { trainer: r.trainer_name })) } };
  });
  route("POST", "/api/assignments/:id/done", async ctx => {
    const u = needUser(ctx);
    const sid = ctx.body && ctx.body.sessionId;
    const session = typeof sid === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sid) ? sid.toLowerCase() : null;
    const r = await ctx.db.query("UPDATE trainer_assignments SET status = 'done', done_at = now(), session_id = $3 WHERE id = $1 AND client_id = $2 AND status = 'new' RETURNING id", [Number(ctx.params[0]) || 0, u.id, session]);
    if (!r.length) throw new HttpError(404, "Не найдено или уже выполнено");
    return { status: 200, body: { ok: true } };
  });
}

module.exports = { install, MAX_ITEMS, MAX_SETS };
