// Роли: пользователь (любой, кто вошёл), VIP-клиент (действующий платный тариф), тренер (подтверждённый), администратор.
// Администратор находит человека и назначает роли кнопками. Первый администратор задаётся в настройках сервера и в приложении не снимается.
const TRAINER_BIO = "Назначен тренером администратором.";

function install(k) {
  const { route, HttpError, bad, needUser, V, isAdmin, isEnvAdmin } = k;
  const adminOnly = ctx => { const u = needUser(ctx); if (!isAdmin(u)) throw new HttpError(403, "Только для администратора"); return u; };

  async function loadUsers(ctx, where, params, limit) {
    const rows = await ctx.db.query(
      `SELECT u.id, u.display_name AS name, u.email, u.telegram_id::text AS tg, u.telegram_username, u.is_admin, u.created_at::text AS created,
              tp.status AS trainer_status, s.tier, s.until::text AS until
       FROM users u LEFT JOIN trainer_profiles tp ON tp.user_id = u.id LEFT JOIN subscriptions s ON s.user_id = u.id AND s.until > now()
       ${where} ORDER BY u.created_at DESC LIMIT ${limit}`, params);
    return rows.map(r => {
      const envAdmin = isEnvAdmin({ id: r.id, telegramId: r.tg });
      return { id: r.id, name: r.name, email: r.email || null, telegram: r.telegram_username || (r.tg ? "привязан" : null), created: r.created,
        roles: { admin: envAdmin || !!r.is_admin, adminFromSettings: envAdmin, trainer: r.trainer_status || null, tier: r.tier || "free", tierUntil: r.until || null } };
    });
  }
  const one = async (ctx, id) => {
    const r = await loadUsers(ctx, "WHERE u.id = $1", [id], 1);
    if (!r.length) throw new HttpError(404, "Пользователь не найден");
    return r[0];
  };

  // Поиск по имени, почте и нику Telegram; фильтр по роли.
  route("GET", "/api/admin/users", async ctx => {
    adminOnly(ctx);
    const q = typeof ctx.query.q === "string" ? ctx.query.q.trim().slice(0, 60) : "";
    const role = V.oneOf(ctx.query.role || "all", ["all", "admin", "trainer", "vip", "user"]);
    if (!role) throw bad("Роль: all, admin, trainer, vip или user");
    const like = "%" + q.replace(/[\\%_]/g, c => "\\" + c) + "%";
    const list = q ? await loadUsers(ctx, "WHERE u.display_name ILIKE $1 OR u.email ILIKE $1 OR u.telegram_username ILIKE $1", [like], 200) : await loadUsers(ctx, "", [], 200);
    const pick = { all: () => true, admin: u => u.roles.admin, trainer: u => u.roles.trainer === "approved", vip: u => u.roles.tier !== "free",
      user: u => !u.roles.admin && u.roles.trainer !== "approved" && u.roles.tier === "free" }[role];
    return { status: 200, body: { items: list.filter(pick).slice(0, 50) } };
  });

  // Назначить или снять роль тренера или администратора.
  route("POST", "/api/admin/users/:uuid/role", async ctx => {
    const me = adminOnly(ctx), id = ctx.params[0].toLowerCase(), b = ctx.body;
    const role = V.oneOf(b.role, ["admin", "trainer"]);
    if (!role || typeof b.on !== "boolean") throw bad("Нужно: role (admin или trainer) и on (true или false)");
    const target = await one(ctx, id);
    if (role === "admin") {
      if (!b.on && id === me.id) throw new HttpError(409, "Нельзя снять права администратора с самого себя");
      if (!b.on && target.roles.adminFromSettings) throw new HttpError(409, "Этот администратор задан в настройках сервера: снять можно только там");
      await ctx.db.query("UPDATE users SET is_admin = $1 WHERE id = $2", [b.on, id]);
    } else if (b.on) {
      await ctx.db.query(
        `INSERT INTO trainer_profiles(user_id, bio, status, decided_at) VALUES ($1, $2, 'approved', now())
         ON CONFLICT (user_id) DO UPDATE SET status = 'approved', decided_at = now()`, [id, TRAINER_BIO]);
    } else {
      await ctx.db.query("UPDATE trainer_profiles SET status = 'rejected', decided_at = now() WHERE user_id = $1", [id]);
      // Снятая роль закрывает открытые связи тренера с клиентами.
      await ctx.db.query("UPDATE trainer_links SET status = 'ended', updated_at = now() WHERE trainer_id = $1 AND status IN ('requested','active')", [id]);
    }
    return { status: 200, body: { user: await one(ctx, id) } };
  });

  // VIP-клиент = действующий платный тариф. Администратор выдаёт его на срок без промокода или снимает.
  route("POST", "/api/admin/users/:uuid/vip", async ctx => {
    adminOnly(ctx);
    const id = ctx.params[0].toLowerCase(), b = ctx.body;
    await one(ctx, id);
    if (b.tier === "none") {
      await ctx.db.query("UPDATE subscriptions SET until = now(), updated_at = now() WHERE user_id = $1", [id]);
    } else {
      const tier = V.oneOf(b.tier, ["premium", "personal"]), days = V.int(b.days, 1, 366);
      if (!tier || !days) throw bad("Тариф: premium или personal; дней от 1 до 366");
      await ctx.db.query(
        `INSERT INTO subscriptions(user_id, tier, until, source) VALUES ($1, $2, now() + ($3::text || ' days')::interval, 'admin')
         ON CONFLICT (user_id) DO UPDATE SET tier = EXCLUDED.tier, until = EXCLUDED.until, source = 'admin', updated_at = now()`, [id, tier, String(days)]);
    }
    return { status: 200, body: { user: await one(ctx, id) } };
  });
}
module.exports = { install, TRAINER_BIO };
