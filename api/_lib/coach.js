// Кабинет тренера: сводка по всем клиентам и дашборд по каждому.
// Тренер видит о клиенте только то, что клиент разрешил (цели и результаты включаются отдельно).
// Без разрешения на результаты цифр нет совсем: запросы к тренировкам и замерам такого клиента даже не выполняются.
const WEEKS = 8;               // сколько недель показывает дашборд
const NEED_DAYS = 7;           // столько дней без тренировки считаются «давно не тренировался»
const LOW_ADHERENCE = 50;      // меньше этого процента от недельной цели считается низкой регулярностью
const NOTE_MAX = 1000;
const ROW_LIMIT = 20000;

function install(k) {
  const { route, HttpError, bad, needUser, V } = k;

  async function needCoach(ctx) {
    const u = needUser(ctx);
    const r = await ctx.db.query("SELECT status FROM trainer_profiles WHERE user_id = $1", [u.id]);
    if (!r.length || r[0].status !== "approved") throw new HttpError(403, "Кабинет доступен подтверждённым тренерам");
    return u;
  }

  // Недели считаются скользящими: последняя — 7 дней до сегодняшнего дня включительно, предыдущая — 7 дней перед ней и так далее.
  const weekIndex = (todayNum, dayN) => {
    const ago = todayNum - dayN;
    return ago < 0 || ago >= WEEKS * 7 ? -1 : WEEKS - 1 - Math.floor(ago / 7);
  };
  const weekStarts = todayNum => Array.from({ length: WEEKS }, (_, i) => V.dayStr(todayNum - 7 * (WEEKS - i) + 1));

  // Выбирает тренировки и замеры только у тех клиентов, кто открыл результаты.
  async function loadResults(ctx, clientIds) {
    const out = { workouts: new Map(), weights: new Map() };
    if (!clientIds.length) return out;
    const from = V.dayStr(ctx.todayNum - WEEKS * 7 + 1), wFrom = V.dayStr(ctx.todayNum - 90);
    const w = await ctx.db.query(
      `SELECT user_id, day::text AS day, program, title, base_points, bonus_points FROM workouts
       WHERE user_id = ANY($1::uuid[]) AND day >= $2::date AND day <= $3::date ORDER BY day DESC LIMIT ${ROW_LIMIT}`, [clientIds, from, V.dayStr(ctx.todayNum + 1)]);
    w.forEach(r => { if (!out.workouts.has(r.user_id)) out.workouts.set(r.user_id, []); out.workouts.get(r.user_id).push({ day: r.day, program: r.program, title: r.title, points: Number(r.base_points) + Number(r.bonus_points) }); });
    const m = await ctx.db.query(
      `SELECT user_id, value, measured_on::text AS day FROM measurements
       WHERE user_id = ANY($1::uuid[]) AND kind = 'weight' AND measured_on >= $2::date ORDER BY measured_on ASC LIMIT ${ROW_LIMIT}`, [clientIds, wFrom]);
    m.forEach(r => { if (!out.weights.has(r.user_id)) out.weights.set(r.user_id, []); out.weights.get(r.user_id).push({ day: r.day, value: Number(r.value) }); });
    return out;
  }

  // Сводка по одному клиенту из его тренировок и замеров.
  function summarize(todayNum, workouts, weights, targetDays) {
    const weekly = Array(WEEKS).fill(0), points = Array(WEEKS).fill(0);
    let w7 = 0, w28 = 0, p28 = 0, last = null;
    workouts.forEach(w => {
      const n = V.dayNum(w.day);
      if (n === null || n > todayNum) return;
      const i = weekIndex(todayNum, n);
      if (i >= 0) { weekly[i]++; points[i] += w.points; }
      if (todayNum - n < 7) w7++;
      if (todayNum - n < 28) { w28++; p28 += w.points; }
      if (last === null || n > last) last = n;
    });
    const adherence = targetDays ? Math.min(100, Math.round(w7 / targetDays * 100)) : null;
    let weightNow = null, weightDelta = null;
    if (weights.length) {
      weightNow = weights[weights.length - 1].value;
      const old = weights.filter(x => todayNum - V.dayNum(x.day) >= 28).pop() || weights[0];
      if (old && old !== weights[weights.length - 1]) weightDelta = Math.round((weightNow - old.value) * 10) / 10;
    }
    return { workouts7: w7, workouts28: w28, points28: p28, lastWorkout: last === null ? null : V.dayStr(last), daysSince: last === null ? null : todayNum - last, adherence, weekly, weeklyPoints: points, weightNow, weightDelta };
  }

  const flagsFor = (l, s, lastMsg) => {
    const f = [];
    if (l.status !== "active") return f;
    if (lastMsg && lastMsg.fromClient) f.push("reply");
    if (s) {
      if (s.daysSince === null || s.daysSince >= NEED_DAYS) f.push("inactive");
      if (s.adherence !== null && s.adherence < LOW_ADHERENCE) f.push("low");
    }
    return f;
  };

  async function loadLinks(ctx, trainerId, onlyId) {
    return ctx.db.query(
      `SELECT l.id, l.client_id, l.status, l.share_goals, l.share_results, l.note, l.trainer_note, l.created_at::text AS created, l.updated_at::text AS updated, cu.display_name AS client_name
       FROM trainer_links l JOIN users cu ON cu.id = l.client_id
       WHERE l.trainer_id = $1 ${onlyId ? "AND l.id = $2" : ""} ORDER BY l.updated_at DESC LIMIT 200`, onlyId ? [trainerId, Number(onlyId)] : [trainerId]);
  }
  async function lastMessages(ctx, linkIds, trainerId) {
    const map = new Map();
    if (!linkIds.length) return map;
    const r = await ctx.db.query("SELECT DISTINCT ON (link_id) link_id, sender_id, created_at::text AS at FROM messages WHERE link_id = ANY($1::bigint[]) ORDER BY link_id, id DESC", [linkIds]);
    r.forEach(m => map.set(Number(m.link_id), { fromClient: m.sender_id !== trainerId, at: m.at }));
    return map;
  }
  async function targets(ctx, clientIds) {
    const map = new Map();
    if (!clientIds.length) return map;
    const r = await ctx.db.query("SELECT user_id, goal, level, days, minutes, place, limits FROM profiles WHERE user_id = ANY($1::uuid[])", [clientIds]);
    r.forEach(p => map.set(p.user_id, { goal: p.goal, level: p.level, days: p.days, minutes: p.minutes, place: p.place, limits: p.limits || [] }));
    return map;
  }

  // ---- сводка ----
  route("GET", "/api/coach/overview", async ctx => {
    const u = await needCoach(ctx);
    const links = await loadLinks(ctx, u.id);
    const active = links.filter(l => l.status === "active");
    const sharedRes = active.filter(l => l.share_results).map(l => l.client_id);
    const goalIds = active.filter(l => l.share_goals).map(l => l.client_id);
    const [res, goals, msgs] = await Promise.all([loadResults(ctx, sharedRes), targets(ctx, goalIds), lastMessages(ctx, active.map(l => Number(l.id)), u.id)]);

    const clients = links.map(l => {
      const id = Number(l.id), isActive = l.status === "active";
      const g = isActive && l.share_goals ? goals.get(l.client_id) || {} : null;
      const s = isActive && l.share_results ? summarize(ctx.todayNum, res.workouts.get(l.client_id) || [], res.weights.get(l.client_id) || [], g && g.days ? g.days : null) : null;
      const lastMsg = msgs.get(id) || null;
      return { linkId: id, name: l.client_name, status: l.status, request: l.note, trainerNote: l.trainer_note || "", shareGoals: !!l.share_goals, shareResults: !!l.share_results,
        goal: g ? g.goal || null : null, targetDays: g ? g.days || null : null, stats: s, lastMessage: lastMsg, flags: flagsFor(l, s, lastMsg), since: l.created, updatedAt: l.updated };
    });

    const withStats = clients.filter(c => c.stats);
    const adh = withStats.map(c => c.stats.adherence).filter(v => v !== null);
    const team = Array(WEEKS).fill(0);
    withStats.forEach(c => c.stats.weekly.forEach((n, i) => { team[i] += n; }));
    const totals = {
      active: active.length, requested: links.filter(l => l.status === "requested").length, ended: links.filter(l => l.status === "ended").length,
      withResults: withStats.length, hiddenResults: active.length - withStats.length,
      activeThisWeek: withStats.filter(c => c.stats.workouts7 > 0).length,
      avgAdherence: adh.length ? Math.round(adh.reduce((a, b) => a + b, 0) / adh.length) : null,
      needAttention: clients.filter(c => c.flags.length).length,
      workouts7: withStats.reduce((a, c) => a + c.stats.workouts7, 0),
    };
    return { status: 200, body: { totals, team: { weekly: team, weekStarts: weekStarts(ctx.todayNum) }, clients } };
  });

  // ---- дашборд клиента ----
  route("GET", "/api/coach/clients/:id", async ctx => {
    const u = await needCoach(ctx);
    const [l] = await loadLinks(ctx, u.id, ctx.params[0]);
    if (!l) throw new HttpError(404, "Не найдено"); // чужие связи не раскрываем
    const isActive = l.status === "active";
    const goals = isActive && l.share_goals ? (await targets(ctx, [l.client_id])).get(l.client_id) || {} : null;
    let series = null, stats = null;
    if (isActive && l.share_results) {
      const res = await loadResults(ctx, [l.client_id]);
      const ws = res.workouts.get(l.client_id) || [], wt = res.weights.get(l.client_id) || [];
      stats = summarize(ctx.todayNum, ws, wt, goals && goals.days ? goals.days : null);
      series = { weekStarts: weekStarts(ctx.todayNum), weekly: stats.weekly, weeklyPoints: stats.weeklyPoints, weight: wt, recent: ws.slice(0, 15) };
      // Записанные тренировки с подходами: список последних и итоги за 28 дней (только при согласии клиента на результаты).
      const from = V.dayStr(ctx.todayNum - 27);
      const sr = await ctx.db.query("SELECT id, day::text AS day, duration_sec, title, items, tonnage_kg, sets, rpe FROM workout_sessions WHERE user_id = $1 ORDER BY day DESC, created_at DESC LIMIT 12", [l.client_id]);
      const agg = await ctx.db.query("SELECT count(*)::int AS n, COALESCE(sum(tonnage_kg), 0) AS kg, COALESCE(sum(duration_sec), 0)::int AS sec, COALESCE(sum(sets), 0)::int AS sets FROM workout_sessions WHERE user_id = $1 AND day >= $2::date AND day <= $3::date", [l.client_id, from, V.dayStr(ctx.todayNum + 1)]);
      series.sessions = sr.map(r => ({ id: r.id, date: r.day, durationSec: r.duration_sec, title: r.title, items: r.items, sets: r.sets, tonnage: Number(r.tonnage_kg), rpe: r.rpe === null || r.rpe === undefined ? null : Number(r.rpe) }));
      stats.sessions28 = { count: agg[0].n, tonnage: Number(agg[0].kg), minutes: Math.round(agg[0].sec / 60), sets: agg[0].sets };
    }
    const msg = (await lastMessages(ctx, [Number(l.id)], u.id)).get(Number(l.id)) || null;
    return { status: 200, body: { client: { linkId: Number(l.id), name: l.client_name, status: l.status, request: l.note, since: l.created },
      shareGoals: !!l.share_goals, shareResults: !!l.share_results, goals, stats, series, trainerNote: l.trainer_note || "", lastMessage: msg, flags: flagsFor(l, stats, msg) } };
  });

  // ---- личная заметка тренера о клиенте: клиент её не видит ----
  route("PATCH", "/api/coach/clients/:id/note", async ctx => {
    const u = await needCoach(ctx);
    const [l] = await loadLinks(ctx, u.id, ctx.params[0]);
    if (!l) throw new HttpError(404, "Не найдено");
    const note = ctx.body && ctx.body.note;
    if (typeof note !== "string") throw bad("Заметка должна быть текстом");
    const text = note.replace(/\r\n/g, "\n").trim();
    if (text.length > NOTE_MAX) throw bad("Заметка не длиннее " + NOTE_MAX + " символов");
    await ctx.db.query("UPDATE trainer_links SET trainer_note = $1 WHERE id = $2 AND trainer_id = $3", [text || null, l.id, u.id]);
    return { status: 200, body: { note: text } };
  });
}

module.exports = { install, WEEKS, NEED_DAYS, LOW_ADHERENCE, NOTE_MAX };
