// Кабинет тренера: дашборд по всем клиентам и дашборд каждого клиента. Подключается после pages-trainers.js, до app.js.
// Тренер видит только то, что клиент разрешил: без разрешения вместо цифр показывается замок и подсказка.
(function () {
  "use strict";
  const P = (window.PAGES = window.PAGES || {});
  const A = () => window.Account;
  const ic = (n, s) => window.Icons.svg(n, s);
  const DISCLAIMER = "Тренер не ставит диагнозы и не назначает лечение. При боли, травмах и болезнях сначала обратитесь к врачу.";
  const errText = r => (r.error === "offline" ? "Сервер недоступен" : r.error);
  const FLAG = { reply: ["Ждёт ответа", "info"], inactive: ["Давно не тренировался", "warn"], low: ["Низкая регулярность", "warn"] };
  const ui = { filter: "all", q: "" };
  P._coachDemo = () => ({ world: demoWorld, client: demoClient }); // для проверок

  async function gate(FW, title) {
    const acc = A(), nav = FW.nav();
    if (acc.state.status === "unknown") { FW.app.innerHTML = '<div class="card"><p class="muted">Загружаю…</p></div>'; await acc.refresh(); }
    if (FW.stale(nav)) return false; // пока ждали сервер, человек ушёл на другую страницу
    const s = acc.state;
    if (s.status === "user") return true;
    FW.app.innerHTML = `<h1>${FW.esc(title)}</h1>` + (s.status === "offline"
      ? '<div class="card"><b>Сервер данных ещё подключается</b><p class="muted">Эта часть появится, когда сервер заработает.</p></div>'
      : '<div class="card"><p>Войди в аккаунт, чтобы продолжить.</p><a class="btn" href="#/account">Войти или зарегистрироваться</a></div>');
    return false;
  }

  const initials = name => String(name || "?").trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0).toUpperCase()).join("") || "?";
  const ddmm = d => (d ? d.slice(8, 10) + "." + d.slice(5, 7) : "");
  const plural = (n, a, b, c) => { const m = n % 100, k = n % 10; return n + " " + (m > 10 && m < 20 ? c : k === 1 ? a : k >= 2 && k <= 4 ? b : c); };
  const sinceText = s => (!s ? "Результаты скрыты" : s.daysSince === null ? "Тренировок пока нет" : s.daysSince === 0 ? "Тренировался сегодня" : s.daysSince === 1 ? "Тренировался вчера" : "Тренировался " + plural(s.daysSince, "день", "дня", "дней") + " назад");
  const goalLabel = id => { const g = window.Planner.GOALS.find(x => x.id === id); return g ? g.label : ""; };
  const flagChips = (flags, esc) => flags.map(f => `<span class="flag ${FLAG[f][1]}">${esc(FLAG[f][0])}</span>`).join("");
  const kpi = (value, label, sub, tone) => `<div class="card kpi ${tone || ""}"><div class="kv">${value}</div><div class="kl">${label}</div>${sub ? `<div class="ks">${sub}</div>` : ""}</div>`;
  const weekBars = (weekly, starts) => window.Charts.bars(weekly.map((v, i) => ({ label: ddmm(starts[i]), value: v })), { label: "Тренировки по неделям" });

  // ---------- пример кабинета на выдуманных клиентах ----------
  // Нужен, чтобы можно было посмотреть кабинет без заявки тренера и без настоящих клиентов. Данные считаются от сегодняшней даты.
  const DEMO_ROWS = [
    { id: 1, name: "Алия Н.", shareGoals: 1, shareResults: 1, goal: "lose", target: 3, weekly: [1, 2, 3, 2, 3, 3, 2, 3], since: 5, weights: [71.2, 70.6, 70.4, 70.1, 69.8], fromClient: true, level: 1, minutes: 30, place: "home", limits: ["knees"], request: "Нужна помощь с питанием" },
    { id: 2, name: "Марат С.", shareGoals: 1, shareResults: 1, goal: "muscle", target: 4, weekly: [2, 2, 1, 3, 2, 1, 1, 1], since: 3, weights: [82, 82.2, 82.1, 82.6], level: 2, minutes: 60, place: "gym", limits: [], request: "Хочу набрать массу" },
    { id: 3, name: "Бек", shareGoals: 0, shareResults: 1, weekly: [0, 0, 1, 0, 0, 1, 0, 0], since: 14, weights: [] },
    { id: 4, name: "Дана К.", shareGoals: 0, shareResults: 0 },
    { id: 5, name: "Сания", status: "requested", request: "Хочу набрать форму к лету" },
  ];
  const isDemo = id => /^demo-\d+$/.test(String(id));
  function demoWorld() {
    const today = Math.floor(Date.now() / 86400000), ds = n => new Date(n * 86400000).toISOString().slice(0, 10);
    const starts = Array.from({ length: 8 }, (_, i) => ds(today - 7 * (8 - i) + 1));
    const clients = DEMO_ROWS.map(r => {
      const active = (r.status || "active") === "active", res = active && r.shareResults, w = r.weekly || Array(8).fill(0);
      const w7 = w[7], w28 = w.slice(4).reduce((a, b) => a + b, 0);
      const lastAgo = w7 > 0 ? 0 : w.some(Boolean) ? 7 * (7 - w.map(Boolean).lastIndexOf(true)) + 3 : null;
      const adherence = r.target && res ? Math.min(100, Math.round(w7 / r.target * 100)) : null;
      const wt = (r.weights || []);
      const stats = res ? { workouts7: w7, workouts28: w28, points28: w28 * 20, lastWorkout: lastAgo === null ? null : ds(today - lastAgo), daysSince: lastAgo, adherence, weekly: w, weeklyPoints: w.map(n => n * 20),
        weightNow: wt.length ? wt[wt.length - 1] : null, weightDelta: wt.length > 1 ? Math.round((wt[wt.length - 1] - wt[0]) * 10) / 10 : null } : null;
      const flags = [];
      if (active) {
        if (r.fromClient) flags.push("reply");
        if (stats && (stats.daysSince === null || stats.daysSince >= 7)) flags.push("inactive");
        if (adherence !== null && adherence < 50) flags.push("low");
      }
      return { linkId: "demo-" + r.id, name: r.name, status: r.status || "active", request: r.request || "", trainerNote: "", shareGoals: !!r.shareGoals, shareResults: !!r.shareResults,
        goal: active && r.shareGoals ? r.goal : null, targetDays: active && r.shareGoals ? r.target : null, stats, lastMessage: r.fromClient ? { fromClient: true, at: "" } : null, flags, since: ds(today - 7 * (r.since || 1)), _row: r };
    });
    const withStats = clients.filter(c => c.stats), team = Array(8).fill(0);
    withStats.forEach(c => c.stats.weekly.forEach((n, i) => { team[i] += n; }));
    const adh = withStats.map(c => c.stats.adherence).filter(v => v !== null), act = clients.filter(c => c.status === "active");
    return { starts, today, clients, overview: {
      totals: { active: act.length, requested: clients.filter(c => c.status === "requested").length, ended: 0, withResults: withStats.length, hiddenResults: act.length - withStats.length,
        activeThisWeek: withStats.filter(c => c.stats.workouts7 > 0).length, avgAdherence: adh.length ? Math.round(adh.reduce((a, b) => a + b, 0) / adh.length) : null, needAttention: clients.filter(c => c.flags.length).length, workouts7: withStats.reduce((a, c) => a + c.stats.workouts7, 0) },
      team: { weekly: team, weekStarts: starts }, clients: clients.map(c => { const o = Object.assign({}, c); delete o._row; return o; }) } };
  }
  function demoClient(id) {
    const w = demoWorld(), c = w.clients.find(x => x.linkId === id);
    if (!c) return null;
    const r = c._row, active = c.status === "active", s = c.stats;
    const wt = r.weights || [], ds = n => new Date(n * 86400000).toISOString().slice(0, 10);
    return { client: { linkId: c.linkId, name: c.name, status: c.status, request: c.request, since: c.since }, shareGoals: c.shareGoals, shareResults: c.shareResults,
      goals: active && r.shareGoals ? { goal: r.goal, level: r.level, days: r.target, minutes: r.minutes, place: r.place, limits: r.limits || [] } : null, stats: s,
      series: s ? { weekStarts: w.starts, weekly: s.weekly, weeklyPoints: s.weeklyPoints, weight: wt.map((v, i) => ({ day: ds(w.today - Math.round(80 - i * (80 / Math.max(1, wt.length - 1))) ), value: v })),
        recent: s.lastWorkout ? Array.from({ length: Math.min(6, s.workouts28) }, (_, i) => ({ day: ds(Math.floor(Date.parse(s.lastWorkout) / 86400000) - i * 2), title: ["День 1: круговая", "День 2: ноги", "Растяжка", "День 3: верх"][i % 4], program: "plan", points: [25, 20, 10, 20][i % 4] })) : [] } : null,
      trainerNote: "", lastMessage: c.lastMessage, flags: c.flags };
  }
  const demoBanner = (back) => `<div class="card demo-banner"><b>Пример кабинета</b><p class="muted">Клиенты и цифры выдуманы, чтобы показать, как выглядит рабочее место тренера. Кнопки действий в примере отключены.</p><a class="btn ghost-btn tiny-btn" href="${back}">Закрыть пример</a></div>`;

  // ---------- все клиенты ----------
  P.coach = async function (FW, arg) {
    const demo = arg === "demo", nav = FW.nav();
    if (!demo && (!(await gate(FW, "Клиенты")) || FW.stale(nav))) return;
    const { app, esc } = FW, acc = A();
    const r = demo ? { ok: true, data: demoWorld().overview } : await acc.coachOverview();
    if (FW.stale(nav)) return;
    if (!r.ok) {
      app.innerHTML = `<a class="back" href="#/trainers">← Тренеры</a><h1>Клиенты</h1><div class="card"><p class="muted">${r.status === 403 ? "Кабинет доступен подтверждённым тренерам. Подать заявку можно в разделе «Тренеры»." : esc(errText(r))}</p>${r.status === 403 ? '<a class="btn" href="#/trainers">К тренерам</a>' : ""}</div>`;
      return;
    }
    const d = r.data, t = d.totals;
    const all = d.clients, requests = all.filter(c => c.status === "requested"), ended = all.filter(c => c.status === "ended");
    const active = all.filter(c => c.status === "active");
    const adh = t.avgAdherence === null ? "—" : t.avgAdherence + "%";
    const sortKey = c => [-c.flags.length, c.stats && c.stats.daysSince !== null ? c.stats.daysSince : 999, c.name];
    const cmp = (a, b) => { const x = sortKey(a), y = sortKey(b); return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2], "ru"); };
    const FILTERS = [["all", "Все", active.length], ["attention", "Внимание", t.needAttention], ["training", "Тренируются", t.activeThisWeek], ["locked", "Нет доступа", t.hiddenResults]];
    const pass = c => (ui.filter === "attention" ? c.flags.length > 0 : ui.filter === "training" ? !!(c.stats && c.stats.workouts7 > 0) : ui.filter === "locked" ? !c.stats : true) && (!ui.q || c.name.toLowerCase().includes(ui.q.toLowerCase()));

    const card = c => {
      const s = c.stats;
      return `<div class="card client">
        <a class="cl-main" href="#/client/${c.linkId}"><span class="avatar">${esc(initials(c.name))}</span>
          <span class="cl-tx"><b>${esc(c.name)}</b><span class="muted">${esc(sinceText(s))}${c.goal ? " · " + esc(goalLabel(c.goal)) : ""}</span></span>
          ${s && s.adherence !== null ? `<span class="adh ${s.adherence >= 70 ? "ok" : s.adherence >= 50 ? "mid" : "low"}" title="Регулярность за неделю">${s.adherence}%</span>` : ""}</a>
        ${s ? `<div class="cl-bars">${window.Charts.bars(s.weekly.map((v, i) => ({ label: ddmm(d.team.weekStarts[i]), value: v })), { small: true, label: "Тренировки по неделям: " + s.weekly.join(", ") })}<span class="muted tiny">${s.workouts7} за 7 дн. · ${s.workouts28} за 28</span></div>`
          : `<div class="cl-lock">${ic("user", 16)}<span class="muted tiny">Клиент не открыл результаты${c.shareGoals ? "" : " и цели"}. Попросите в чате.</span></div>`}
        ${c.flags.length ? `<div class="flags">${flagChips(c.flags, esc)}</div>` : ""}
        <div class="cl-act"><a class="btn tiny-btn" href="#/client/${c.linkId}">Дашборд</a>${demo ? '<button class="ghost tiny-btn" type="button" disabled>Чат</button>' : `<a class="btn ghost-btn tiny-btn" href="#/chat/${c.linkId}">Чат</a>`}</div></div>`;
    };
    const list = active.filter(pass).sort(cmp);
    app.innerHTML = `<a class="back" href="#/trainers">← Тренеры</a><h1>Клиенты</h1>${demo ? demoBanner("#/trainers") : ""}
      <p class="muted">Сводка по всем вашим клиентам. Цифры только у тех, кто открыл результаты.</p>
      <div class="kpis">${kpi(t.active, "Активных клиентов", t.requested ? "+" + plural(t.requested, "новый запрос", "новых запроса", "новых запросов") : "")}${kpi(t.withResults ? t.activeThisWeek + " из " + t.withResults : "—", "Тренировались за 7 дней", t.hiddenResults ? plural(t.hiddenResults, "клиент", "клиента", "клиентов") + " без доступа" : "")}${kpi(adh, "Регулярность", "от недельной цели")}${kpi(t.needAttention, "Нужно внимание", "ждут ответа или давно не тренировались", t.needAttention ? "warn" : "")}</div>
      <div class="card"><div class="row"><b>Тренировки клиентов по неделям</b><span class="muted tiny">${t.workouts7} за 7 дн.</span></div>${weekBars(d.team.weekly, d.team.weekStarts)}</div>
      ${requests.length ? `<h2>Новые запросы (${requests.length})</h2>${requests.map(c => `<div class="card"><div class="row"><div><b>${esc(c.name)}</b>${c.request ? `<div class="muted tiny">«${esc(c.request)}»</div>` : ""}</div><div class="cl-act"><button data-act="accept" data-id="${c.linkId}" type="button" ${demo ? "disabled" : ""}>Принять</button><button class="ghost" data-act="decline" data-id="${c.linkId}" type="button" ${demo ? "disabled" : ""}>Отклонить</button></div></div></div>`).join("")}` : ""}
      <h2>Мои клиенты</h2>
      ${active.length ? `<div class="chips" id="cfilters">${FILTERS.map(f => `<button type="button" class="ghost ${ui.filter === f[0] ? "on" : ""}" data-f="${f[0]}">${f[1]}${f[2] ? ` <span class="cnt">${f[2]}</span>` : ""}</button>`).join("")}</div>
        <input id="cq" type="search" placeholder="Найти клиента по имени" value="${esc(ui.q)}" maxlength="60" style="width:100%;margin-bottom:6px" aria-label="Поиск клиента">
        <div id="clist">${list.map(card).join("") || '<div class="card"><p class="muted">Нет клиентов с такими условиями.</p></div>'}</div>`
        : '<div class="card"><p class="muted">Пока нет активных клиентов. Клиенты находят вас в разделе «Тренеры»; запрос можно отправить с тарифом «Персональный тренер».</p></div>'}
      ${ended.length ? `<details class="card"><summary><b>Завершённые (${ended.length})</b></summary>${ended.map(c => `<div class="row" style="margin-top:10px"><span>${esc(c.name)}</span><a class="btn ghost-btn tiny-btn" href="#/chat/${c.linkId}">Переписка</a></div>`).join("")}</details>` : ""}
      <p class="muted tiny">${DISCLAIMER}</p>`;
    if (!demo) app.querySelectorAll("[data-act]").forEach(b => b.onclick = async () => { await acc.linkAction(b.dataset.id, b.dataset.act); P.coach(FW); });
    app.querySelectorAll("#cfilters [data-f]").forEach(b => b.onclick = () => { ui.filter = b.dataset.f; P.coach(FW, arg); });
    const q = document.getElementById("cq");
    if (q) q.oninput = () => {
      ui.q = q.value.trim();
      const box = document.getElementById("clist");
      box.innerHTML = active.filter(pass).sort(cmp).map(card).join("") || '<div class="card"><p class="muted">Нет клиентов с такими условиями.</p></div>';
    };
  };

  // ---------- один клиент ----------
  P.clientView = async function (FW, id) {
    const demo = isDemo(id), home = demo ? "#/coach/demo" : "#/coach", nav = FW.nav();
    if (!demo && (!(await gate(FW, "Клиент")) || FW.stale(nav))) return;
    const { app, esc } = FW, acc = A();
    const r = demo ? (demoClient(id) ? { ok: true, data: demoClient(id) } : { ok: false, error: "Не найдено" }) : await acc.coachClient(id);
    if (FW.stale(nav)) return;
    if (!r.ok) { app.innerHTML = `<a class="back" href="${home}">← Клиенты</a><h1>Клиент</h1><div class="card"><p class="muted">${esc(errText(r))}</p></div>`; return; }
    const b = r.data, c = b.client, s = b.stats, ser = b.series, g = b.goals, C = window.Catalog, PL = window.Planner;
    const active = c.status === "active";
    const lock = what => `<div class="card lockcard"><span class="lk">${ic("user", 20)}</span><div><b>Клиент не открыл ${what}</b><p class="muted">Попросите открыть доступ в чате: клиент включает его сам и может отозвать в любой момент.</p>${demo ? "" : `<a class="btn ghost-btn tiny-btn" href="#/chat/${c.linkId}">Написать клиенту</a>`}</div></div>`;
    const target = g && g.days ? g.days : null;
    const delta = s && s.weightDelta !== null ? (s.weightDelta > 0 ? "+" : "") + s.weightDelta + " кг за период" : "";
    app.innerHTML = `<a class="back" href="${home}">← Клиенты</a>${demo ? demoBanner(home) : ""}
      <div class="cl-head"><span class="avatar big">${esc(initials(c.name))}</span><div><h1>${esc(c.name)}</h1><div class="muted tiny">${active ? "Клиент с " + esc(ddmm(c.since)) : c.status === "ended" ? "Работа завершена" : "Запрос ждёт ответа"}</div></div></div>
      ${b.flags.length ? `<div class="flags">${flagChips(b.flags, esc)}</div>` : ""}
      <div class="consent"><span class="chip-c ${b.shareGoals ? "on" : ""}">${b.shareGoals ? "Цели открыты" : "Цели закрыты"}</span><span class="chip-c ${b.shareResults ? "on" : ""}">${b.shareResults ? "Результаты открыты" : "Результаты закрыты"}</span></div>
      ${c.request ? `<div class="card"><div class="muted tiny">Запрос клиента</div><p style="margin:4px 0 0">«${esc(c.request)}»</p></div>` : ""}
      ${!active ? `<div class="card"><p class="muted">${c.status === "ended" ? "Работа завершена: данные клиента больше не показываются." : "Примите запрос на странице «Клиенты», чтобы открыть дашборд."}</p></div>` : ""}
      ${active && s ? `<div class="kpis">${kpi(target ? s.workouts7 + " / " + target : s.workouts7, "Тренировок за 7 дней", target ? "регулярность " + s.adherence + "%" : "цель не открыта")}${kpi(s.workouts28, "Тренировок за 28 дней", s.lastWorkout ? "последняя " + ddmm(s.lastWorkout) : "пока нет")}${kpi(s.points28, "Баллов за 28 дней", "")}${kpi(s.weightNow !== null ? s.weightNow + " кг" : "—", "Вес сейчас", delta)}</div>
        <div class="card"><div class="row"><b>Тренировки по неделям</b>${target ? `<span class="muted tiny">цель ${plural(target, "тренировка", "тренировки", "тренировок")} в неделю</span>` : ""}</div>${window.Charts.bars(ser.weekly.map((v, i) => ({ label: ddmm(ser.weekStarts[i]), value: v })), { target, label: "Тренировки по неделям" })}</div>
        <div class="card"><b>Вес</b>${ser.weight.length ? window.Charts.line(ser.weight, "кг") : '<p class="muted">Замеров веса за 90 дней нет.</p>'}</div>` : ""}
      ${active && !s ? lock("результаты") : ""}
      ${active ? `<h2>Цели и ограничения</h2>${g ? `<div class="card"><p style="margin:0">${g.goal ? esc(goalLabel(g.goal)) : "Цель не указана"} · ${g.level ? esc(C.labelOf(C.LEVELS, g.level)) : "уровень не указан"}</p>
        <p class="muted" style="margin:6px 0 0">${g.days ? g.days + " дн. по " + g.minutes + " мин · " : ""}${g.place ? esc(PL.PLACES.find(x => x.id === g.place).label) : ""}</p>
        <p class="muted" style="margin:6px 0 0">${g.limits && g.limits.length ? "Ограничения: " + esc(g.limits.map(l => C.labelOf(C.LIMITS, l)).join(", ")) : "Ограничений не указано"}</p></div>` : lock("цели и ограничения")}` : ""}
      ${active && s ? `<h2>Последние тренировки</h2><div class="card">${ser.recent.length ? ser.recent.map(w => `<div class="row wl"><span>${esc(ddmm(w.day))} · ${esc(w.title || w.program)}</span><span class="pill">+${w.points}</span></div>`).join("") : '<p class="muted">Пока нет.</p>'}</div>` : ""}
      <h2>Моя заметка</h2>
      <div class="card"><p class="muted tiny" style="margin-top:0">Видите только вы, клиент заметку не получает.</p>
        <textarea id="tnote" aria-label="Заметка о клиенте" rows="4" maxlength="1000" placeholder="Что важно помнить: ограничения, договорённости, план на ближайшие недели">${esc(b.trainerNote)}</textarea>
        <div class="row"><span class="status" id="nstat" role="status"></span><button type="button" id="nsave">Сохранить</button></div></div>
      <div class="cl-act wrap">${demo ? '<button type="button" disabled>Открыть чат</button>' : `<a class="btn" href="#/chat/${c.linkId}">Открыть чат</a>`}${active ? `<button type="button" class="ghost" id="cend" ${demo ? "disabled" : ""}>Завершить работу с клиентом</button>` : ""}</div>
      <p class="muted tiny">${DISCLAIMER}</p>`;
    const save = document.getElementById("nsave");
    save.onclick = async () => {
      const st = document.getElementById("nstat");
      if (demo) { st.textContent = "В примере заметка не сохраняется"; return; }
      const res = await acc.coachNote(c.linkId, document.getElementById("tnote").value);
      st.textContent = res.ok ? "Сохранено" : errText(res);
      st.classList.toggle("ok", !!res.ok);
    };
    const end = document.getElementById("cend");
    if (end && !demo) end.onclick = async () => { if (confirm("Завершить работу с этим клиентом? Доступ к его данным закроется.")) { await acc.linkAction(c.linkId, "end"); location.hash = "#/coach"; } };
  };
})();
