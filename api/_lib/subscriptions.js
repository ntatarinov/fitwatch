// Тарифы, промокоды и закрытые программы. Оплата не подключена: тариф выдаётся промокодом, который создаёт администратор.
const crypto = require("crypto");
const { listFor, PROGRAMS } = require("./programs");

const TIERS = [
  { id: "free", title: "Бесплатный", price: "0", features: ["Базовые программы и упражнения", "Дневник тренировок и питания", "Рейтинг и история веса"] },
  { id: "premium", title: "Премиум", price: "по промокоду", features: ["Всё из бесплатного", "Расширенные программы на 4–8 недель", "Рост нагрузки по неделям"] },
  { id: "personal", title: "Персональный тренер", price: "по промокоду", features: ["Всё из премиума", "Личный тренер и переписка с ним", "План с учётом ваших особенностей"] },
];

function install(k) {
  const { route, HttpError, bad, needUser, V, tierOf, isAdmin } = k;
  const adminOnly = ctx => { const u = needUser(ctx); if (!isAdmin(u)) throw new HttpError(403, "Только для администратора"); return u; };

  route("GET", "/api/subscription", async ctx => {
    const u = needUser(ctx), t = await tierOf(ctx.db, u.id);
    return { status: 200, body: { tier: t.tier, until: t.until, tiers: TIERS, payments: false } };
  });

  route("GET", "/api/programs", async ctx => {
    const u = needUser(ctx), t = await tierOf(ctx.db, u.id);
    return { status: 200, body: { tier: t.tier, items: listFor(t.tier) } };
  });

  // Погашение кода. Счётчик увеличивается одной командой, поэтому лимит нельзя обойти параллельными запросами.
  route("POST", "/api/subscription/redeem", async ctx => {
    const u = needUser(ctx), { db } = ctx;
    const code = typeof ctx.body.code === "string" ? ctx.body.code.trim().toUpperCase() : "";
    if (!/^[A-Z0-9-]{4,24}$/.test(code)) throw bad("Проверьте код");
    const used = await db.query("SELECT 1 FROM promo_redemptions WHERE code = $1 AND user_id = $2", [code, u.id]);
    if (used.length) throw new HttpError(409, "Вы уже использовали этот код");
    const got = await db.query("UPDATE promo_codes SET used = used + 1 WHERE code = $1 AND used < max_uses RETURNING tier, days", [code]);
    if (!got.length) throw new HttpError(404, "Код не найден или уже исчерпан");
    const ins = await db.query("INSERT INTO promo_redemptions(code, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING code", [code, u.id]);
    if (!ins.length) { await db.query("UPDATE promo_codes SET used = used - 1 WHERE code = $1", [code]); throw new HttpError(409, "Вы уже использовали этот код"); }
    await db.query(
      `INSERT INTO subscriptions(user_id, tier, until, source) VALUES ($1, $2, now() + ($3::text || ' days')::interval, 'promo')
       ON CONFLICT (user_id) DO UPDATE SET
         tier = CASE WHEN subscriptions.until > now() AND subscriptions.tier = 'personal' THEN 'personal' ELSE EXCLUDED.tier END,
         until = GREATEST(subscriptions.until, now()) + ($3::text || ' days')::interval, updated_at = now()`,
      [u.id, got[0].tier, String(got[0].days)]);
    const t = await tierOf(db, u.id);
    return { status: 200, body: { tier: t.tier, until: t.until } };
  });

  // ---- администратор: промокоды ----
  route("POST", "/api/admin/promo", async ctx => {
    adminOnly(ctx);
    const tier = V.oneOf(ctx.body.tier, ["premium", "personal"]), days = V.int(ctx.body.days, 1, 366), max = V.int(ctx.body.maxUses, 1, 1000);
    if (!tier || !days || !max) throw bad("Тариф: premium или personal; дней 1–366; использований 1–1000");
    let code = typeof ctx.body.code === "string" && ctx.body.code.trim() ? ctx.body.code.trim().toUpperCase() : "FW-" + crypto.randomBytes(4).toString("hex").toUpperCase();
    if (!/^[A-Z0-9-]{4,24}$/.test(code)) throw bad("Код: 4–24 символа, латиница, цифры и дефис");
    const r = await ctx.db.query("INSERT INTO promo_codes(code, tier, days, max_uses) VALUES ($1, $2, $3, $4) ON CONFLICT (code) DO NOTHING RETURNING code", [code, tier, days, max]);
    if (!r.length) throw new HttpError(409, "Такой код уже есть");
    return { status: 201, body: { code, tier, days, maxUses: max } };
  });
  route("GET", "/api/admin/promo", async ctx => {
    adminOnly(ctx);
    const rows = await ctx.db.query("SELECT code, tier, days, max_uses, used FROM promo_codes ORDER BY created_at DESC LIMIT 50");
    return { status: 200, body: { items: rows.map(r => ({ code: r.code, tier: r.tier, days: r.days, maxUses: r.max_uses, used: r.used })) } };
  });
}
module.exports = { install, TIERS, PROGRAMS };
