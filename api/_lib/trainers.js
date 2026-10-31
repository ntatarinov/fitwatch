// Тренеры и переписка. Тренер подтверждается администратором; клиент с тарифом «Персональный тренер» отправляет запрос;
// данные клиента тренер видит только по согласию клиента (цели и ограничения, результаты — отдельными переключателями).
// Тренер не получает права на медицинские назначения и диагностику: это написано и в интерфейсе.
function install(k) {
  const { route, HttpError, bad, needUser, V, tierOf, TIER_RANK, isAdmin } = k;
  const adminOnly = ctx => { const u = needUser(ctx); if (!isAdmin(u)) throw new HttpError(403, "Только для администратора"); return u; };

  async function loadLink(ctx, id) {
    const r = await ctx.db.query(
      `SELECT l.id, l.client_id, l.trainer_id, l.status, l.share_goals, l.share_results, l.note, l.created_at::text AS created,
              cu.display_name AS client_name, tu.display_name AS trainer_name
       FROM trainer_links l JOIN users cu ON cu.id = l.client_id JOIN users tu ON tu.id = l.trainer_id
       WHERE l.id = $1 AND (l.client_id = $2 OR l.trainer_id = $2)`, [Number(id), ctx.user.id]);
    if (!r.length) throw new HttpError(404, "Не найдено"); // чужие связи не раскрываем
    return r[0];
  }
  const roleOf = (l, uid) => (l.client_id === uid ? "client" : "trainer");
  const linkOut = (l, uid) => {
    const role = roleOf(l, uid);
    return { id: Number(l.id), role, status: l.status, with: { name: role === "client" ? l.trainer_name : l.client_name }, shareGoals: !!l.share_goals, shareResults: !!l.share_results, note: l.note, createdAt: l.created };
  };

  // ---- заявка тренера ----
  route("POST", "/api/trainer/apply", async ctx => {
    const u = needUser(ctx), bio = V.str(ctx.body.bio, 20, 1000), spec = ctx.body.specialties === undefined ? "" : V.str(String(ctx.body.specialties), 0, 200);
    if (!bio) throw bad("О себе: от 20 до 1000 символов");
    if (spec === null) throw bad("Специализация: до 200 символов");
    const r = await ctx.db.query(
      `INSERT INTO trainer_profiles(user_id, bio, specialties) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET bio = EXCLUDED.bio, specialties = EXCLUDED.specialties, status = 'pending', decided_at = NULL
       WHERE trainer_profiles.status <> 'approved' RETURNING status`, [u.id, bio, spec]);
    if (!r.length) throw new HttpError(409, "Вы уже подтверждены как тренер");
    return { status: 201, body: { status: r[0].status } };
  });
  route("GET", "/api/trainer/me", async ctx => {
    const u = needUser(ctx);
    const r = await ctx.db.query("SELECT bio, specialties, status FROM trainer_profiles WHERE user_id = $1", [u.id]);
    return { status: 200, body: { profile: r.length ? { bio: r[0].bio, specialties: r[0].specialties, status: r[0].status } : null } };
  });
  route("GET", "/api/trainers", async ctx => {
    const u = needUser(ctx);
    const rows = await ctx.db.query(
      `SELECT u.id, u.display_name AS name, t.bio, t.specialties FROM trainer_profiles t JOIN users u ON u.id = t.user_id
       WHERE t.status = 'approved' AND u.id <> $1 ORDER BY u.display_name LIMIT 100`, [u.id]);
    return { status: 200, body: { items: rows.map(r => ({ id: r.id, name: r.name, bio: r.bio, specialties: r.specialties })) } };
  });

  // ---- запрос клиента ----
  route("POST", "/api/trainers/:uuid/request", async ctx => {
    const u = needUser(ctx), trainerId = ctx.params[0].toLowerCase();
    if (trainerId === u.id) throw bad("Нельзя выбрать самого себя");
    const t = await tierOf(ctx.db, u.id);
    if (TIER_RANK[t.tier] < TIER_RANK.personal) throw new HttpError(403, "Нужна подписка «Персональный тренер»");
    const note = ctx.body.note === undefined || ctx.body.note === null || ctx.body.note === "" ? null : V.str(String(ctx.body.note), 1, 300);
    if (ctx.body.note && !note) throw bad("Сообщение: до 300 символов");
    const ok = await ctx.db.query("SELECT 1 FROM trainer_profiles WHERE user_id = $1 AND status = 'approved'", [trainerId]);
    if (!ok.length) throw new HttpError(404, "Тренер не найден");
    let r;
    try {
      r = await ctx.db.query("INSERT INTO trainer_links(client_id, trainer_id, note) VALUES ($1, $2, $3) RETURNING id", [u.id, trainerId, note]);
    } catch (e) {
      if (e && (e.code === "23505" || /duplicate key|unique/i.test(String(e.message)))) throw new HttpError(409, "Запрос этому тренеру уже отправлен");
      throw e;
    }
    return { status: 201, body: { id: Number(r[0].id), status: "requested" } };
  });

  route("GET", "/api/links", async ctx => {
    const u = needUser(ctx);
    const rows = await ctx.db.query(
      `SELECT l.id, l.client_id, l.trainer_id, l.status, l.share_goals, l.share_results, l.note, l.created_at::text AS created,
              cu.display_name AS client_name, tu.display_name AS trainer_name
       FROM trainer_links l JOIN users cu ON cu.id = l.client_id JOIN users tu ON tu.id = l.trainer_id
       WHERE l.client_id = $1 OR l.trainer_id = $1 ORDER BY l.updated_at DESC LIMIT 100`, [u.id]);
    return { status: 200, body: { items: rows.map(l => linkOut(l, u.id)) } };
  });

  const decide = (action, to, from) => route("POST", "/api/links/:id/" + action, async ctx => {
    const u = needUser(ctx), l = await loadLink(ctx, ctx.params[0]);
    if (action === "end") {
      if (!["requested", "active"].includes(l.status)) throw new HttpError(409, "Связь уже завершена");
    } else {
      if (l.trainer_id !== u.id) throw new HttpError(403, "Это может сделать только тренер");
      if (l.status !== from) throw new HttpError(409, "Запрос уже обработан");
    }
    await ctx.db.query("UPDATE trainer_links SET status = $1, updated_at = now() WHERE id = $2", [to, l.id]);
    return { status: 200, body: { id: Number(l.id), status: to } };
  });
  decide("accept", "active", "requested");
  decide("decline", "declined", "requested");
  decide("end", "ended");

  // Согласие клиента: что видит тренер.
  route("PATCH", "/api/links/:id/share", async ctx => {
    const u = needUser(ctx), l = await loadLink(ctx, ctx.params[0]);
    if (l.client_id !== u.id) throw new HttpError(403, "Это может сделать только клиент");
    const b = ctx.body;
    if ((b.goals !== undefined && typeof b.goals !== "boolean") || (b.results !== undefined && typeof b.results !== "boolean")) throw bad("Неверное значение");
    // Каждое значение меняется отдельно (COALESCE): два одновременных запроса не затирают друг друга.
    const r = await ctx.db.query(
      "UPDATE trainer_links SET share_goals = COALESCE($1::boolean, share_goals), share_results = COALESCE($2::boolean, share_results), updated_at = now() WHERE id = $3 RETURNING share_goals, share_results",
      [b.goals === undefined ? null : b.goals, b.results === undefined ? null : b.results, l.id]);
    return { status: 200, body: { id: Number(l.id), shareGoals: !!r[0].share_goals, shareResults: !!r[0].share_results } };
  });

  // Что тренер видит о клиенте: только разрешённое.
  route("GET", "/api/links/:id/client", async ctx => {
    const u = needUser(ctx), l = await loadLink(ctx, ctx.params[0]);
    if (l.trainer_id !== u.id) throw new HttpError(403, "Это видит только тренер");
    if (l.status !== "active") throw new HttpError(409, "Связь не активна");
    const out = { client: { name: l.client_name }, shareGoals: !!l.share_goals, shareResults: !!l.share_results, goals: null, results: null };
    if (l.share_goals) {
      const p = await ctx.db.query("SELECT goal, level, days, minutes, place, limits FROM profiles WHERE user_id = $1", [l.client_id]);
      out.goals = p.length ? { goal: p[0].goal, level: p[0].level, days: p[0].days, minutes: p[0].minutes, place: p[0].place, limits: p[0].limits || [] } : {};
    }
    if (l.share_results) {
      const w = await ctx.db.query("SELECT day::text AS day, program, title, base_points, bonus_points FROM workouts WHERE user_id = $1 ORDER BY day DESC LIMIT 30", [l.client_id]);
      const m = await ctx.db.query("SELECT kind, value, measured_on::text AS day FROM measurements WHERE user_id = $1 ORDER BY measured_on DESC LIMIT 30", [l.client_id]);
      out.results = {
        workouts: w.map(r => ({ day: r.day, program: r.program, title: r.title, points: Number(r.base_points) + Number(r.bonus_points) })),
        measurements: m.map(r => ({ kind: r.kind, value: Number(r.value), day: r.day })),
      };
    }
    return { status: 200, body: out };
  });

  // ---- переписка ----
  route("GET", "/api/links/:id/messages", async ctx => {
    const u = needUser(ctx), l = await loadLink(ctx, ctx.params[0]);
    if (!["active", "ended"].includes(l.status)) throw new HttpError(409, "Переписка откроется, когда тренер примет запрос");
    const after = V.int(ctx.query.after === undefined ? 0 : ctx.query.after, 0, 1e12);
    if (after === null) throw bad("Неверный параметр");
    const rows = await ctx.db.query("SELECT id, sender_id, body, created_at::text AS at FROM messages WHERE link_id = $1 AND id > $2 ORDER BY id ASC LIMIT 100", [l.id, after]);
    return { status: 200, body: { status: l.status, items: rows.map(r => ({ id: Number(r.id), mine: r.sender_id === u.id, body: r.body, at: r.at })) } };
  });
  route("POST", "/api/links/:id/messages", async ctx => {
    const u = needUser(ctx), l = await loadLink(ctx, ctx.params[0]);
    if (l.status !== "active") throw new HttpError(409, "Переписка закрыта");
    const body = V.str(ctx.body.body, 1, 2000);
    if (!body) throw bad("Сообщение: от 1 до 2000 символов");
    const n = await ctx.db.query("SELECT count(*)::int AS n FROM messages WHERE sender_id = $1 AND created_at > now() - interval '1 minute'", [u.id]);
    if (Number(n[0].n) >= 20) throw new HttpError(429, "Слишком много сообщений, подождите минуту");
    const r = await ctx.db.query("INSERT INTO messages(link_id, sender_id, body) VALUES ($1, $2, $3) RETURNING id", [l.id, u.id, body]);
    return { status: 201, body: { id: Number(r[0].id) } };
  });

  // ---- администратор: подтверждение тренеров ----
  route("GET", "/api/admin/trainers", async ctx => {
    adminOnly(ctx);
    const status = V.oneOf(ctx.query.status || "pending", ["pending", "approved", "rejected"]);
    if (!status) throw bad("Статус: pending, approved или rejected");
    const rows = await ctx.db.query(
      `SELECT u.id, u.display_name AS name, u.email, t.bio, t.specialties, t.status FROM trainer_profiles t JOIN users u ON u.id = t.user_id
       WHERE t.status = $1 ORDER BY t.created_at LIMIT 100`, [status]);
    return { status: 200, body: { items: rows.map(r => ({ id: r.id, name: r.name, email: r.email, bio: r.bio, specialties: r.specialties, status: r.status })) } };
  });
  const verdict = (action, to) => route("POST", "/api/admin/trainers/:uuid/" + action, async ctx => {
    adminOnly(ctx);
    const r = await ctx.db.query("UPDATE trainer_profiles SET status = $1, decided_at = now() WHERE user_id = $2 RETURNING status", [to, ctx.params[0].toLowerCase()]);
    if (!r.length) throw new HttpError(404, "Заявка не найдена");
    return { status: 200, body: { status: r[0].status } };
  });
  verdict("approve", "approved");
  verdict("reject", "rejected");
}
module.exports = { install };
