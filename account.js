// Связь с сервером: вход, данные тела, тренировки, рейтинг. Если сервер недоступен (нет базы, нет сети), приложение работает без входа.
(function (root) {
  "use strict";
  const state = { status: "unknown", user: null, profile: null, stats: null }; // unknown | anon | user | offline
  const listeners = [];
  let cfgPromise = null;
  const notify = () => listeners.forEach(f => { try { f(state); } catch (e) { /* подписчик не должен ломать остальных */ } });

  async function api(method, path, body) {
    try {
      const res = await root.fetch(path, {
        method, credentials: "same-origin",
        headers: Object.assign({ Accept: "application/json" }, method === "GET" ? {} : { "Content-Type": "application/json", "X-FW": "1" }),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let data = null;
      try { data = await res.json(); } catch (e) { return { ok: false, status: res.status, error: "offline", data: null }; }
      return { ok: res.ok, status: res.status, data, error: res.ok ? null : (data && data.error) || "Ошибка" };
    } catch (e) { return { ok: false, status: 0, error: "offline", data: null }; }
  }

  function set(next) {
    const changed = state.status !== next.status || (state.user && state.user.name) !== (next.user && next.user.name) || (state.user && state.user.ratingOptIn) !== (next.user && next.user.ratingOptIn);
    Object.assign(state, next);
    if (changed) notify();
  }
  async function refresh() {
    const r = await api("GET", "/api/me");
    if (r.ok) set({ status: "user", user: r.data.user, profile: r.data.profile, stats: r.data.stats });
    else if (r.status === 401) set({ status: "anon", user: null, profile: null, stats: null });
    else set({ status: "offline", user: null, profile: null, stats: null });
    return state;
  }
  const ok = async (p, after) => { const r = await p; if (r.ok && after !== false) await refresh(); return r; };

  // Данные из браузера → формат сервера (пустые поля не отправляем, чтобы не затереть сохранённое).
  function profileFromLocal(me) {
    const out = {};
    if (!me) return out;
    ["goal", "level", "days", "minutes", "place", "sex", "age"].forEach(k => { if (me[k] != null && me[k] !== "") out[k] = me[k]; });
    if (Array.isArray(me.limits)) out.limits = me.limits;
    if (me.height != null) out.height = me.height;
    if (me.weight != null) out.weight = me.weight;
    return out;
  }
  // История тренировок из браузера: последние 30 дней, по одной записи в день.
  function workoutsFromLog(log, today) {
    const t = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
    const seen = new Set(), out = [];
    (log || []).forEach(l => {
      if (!l || typeof l.date !== "string" || seen.has(l.date)) return;
      if ((t(today) - t(l.date)) / 86400000 > 30 || t(l.date) > t(today)) return;
      seen.add(l.date);
      out.push({ day: l.date, program: String(l.p), dayId: String(l.d), title: l.t || undefined });
    });
    return out.slice(-60);
  }

  const A = {
    state, api, refresh, profileFromLocal, workoutsFromLog,
    onChange: f => listeners.push(f),
    // настройки (имя бота), вход и привязка Telegram
    config: () => (cfgPromise || (cfgPromise = api("GET", "/api/config").then(r => (r.ok ? r.data : { telegramEnabled: false, telegramClientId: null })))),
    telegramNonce: () => api("POST", "/api/auth/telegram/nonce", {}),
    telegramLogin: idToken => api("POST", "/api/auth/telegram", { id_token: idToken }),
    register: (email, password, name) => ok(api("POST", "/api/auth/register", { email, password, name })),
    login: (email, password) => ok(api("POST", "/api/auth/login", { email, password })),
    logout: () => ok(api("POST", "/api/auth/logout", {})),
    setRating: v => ok(api("PATCH", "/api/me", { ratingOptIn: !!v })),
    saveProfile: p => api("PATCH", "/api/me", { profile: p }),
    deleteAccount: (password, confirm) => ok(api("DELETE", "/api/me", confirm ? { confirm } : { password })),
    measurements: kind => api("GET", "/api/measurements?kind=" + kind),
    addMeasurement: (kind, value, day) => api("POST", "/api/measurements", day ? { kind, value, day } : { kind, value }),
    deleteMeasurement: id => api("DELETE", "/api/measurements/" + id),
    leaderboard: period => api("GET", "/api/leaderboard?period=" + period),
    recordWorkout: w => (state.status === "user" ? api("POST", "/api/workouts", w) : Promise.resolve({ ok: false, status: 0, error: "not-signed-in" })),
    syncWorkouts: items => api("POST", "/api/workouts/sync", { items }),
    // тарифы и программы
    subscription: () => api("GET", "/api/subscription"),
    redeem: code => api("POST", "/api/subscription/redeem", { code }),
    programs: () => api("GET", "/api/programs"),
    // тренеры и переписка
    trainerMe: () => api("GET", "/api/trainer/me"),
    trainerApply: (bio, specialties) => api("POST", "/api/trainer/apply", { bio, specialties }),
    trainers: () => api("GET", "/api/trainers"),
    requestTrainer: (id, note) => api("POST", "/api/trainers/" + id + "/request", note ? { note } : {}),
    links: () => api("GET", "/api/links"),
    linkAction: (id, action) => api("POST", "/api/links/" + id + "/" + action, {}),
    setShare: (id, v) => api("PATCH", "/api/links/" + id + "/share", v),
    clientView: id => api("GET", "/api/links/" + id + "/client"),
    messages: (id, after) => api("GET", "/api/links/" + id + "/messages?after=" + (after || 0)),
    sendMessage: (id, body) => api("POST", "/api/links/" + id + "/messages", { body }),
    // администратор
    adminTrainers: status => api("GET", "/api/admin/trainers?status=" + status),
    adminVerdict: (id, action) => api("POST", "/api/admin/trainers/" + id + "/" + action, {}),
    adminPromoCreate: v => api("POST", "/api/admin/promo", v),
    adminPromoList: () => api("GET", "/api/admin/promo"),
  };
  root.Account = A;
  if (typeof module !== "undefined" && module.exports) module.exports = A;
})(typeof window !== "undefined" ? window : globalThis);
