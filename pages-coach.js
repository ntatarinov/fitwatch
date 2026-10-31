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

  async function gate(FW, title) {
    const acc = A();
    if (acc.state.status === "unknown") { FW.app.innerHTML = '<div class="card"><p class="muted">Загружаю…</p></div>'; await acc.refresh(); }
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

  // ---------- все клиенты ----------
  P.coach = async function (FW) {
    if (!(await gate(FW, "Клиенты"))) return;
    const { app, esc } = FW, acc = A();
    const r = await acc.coachOverview();
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
        <div class="cl-act"><a class="btn tiny-btn" href="#/client/${c.linkId}">Дашборд</a><a class="btn ghost-btn tiny-btn" href="#/chat/${c.linkId}">Чат</a></div></div>`;
    };
    const list = active.filter(pass).sort(cmp);
    app.innerHTML = `<a class="back" href="#/trainers">← Тренеры</a><h1>Клиенты</h1>
      <p class="muted">Сводка по всем вашим клиентам. Цифры только у тех, кто открыл результаты.</p>
      <div class="kpis">${kpi(t.active, "Активных клиентов", t.requested ? "+" + plural(t.requested, "новый запрос", "новых запроса", "новых запросов") : "")}${kpi(t.withResults ? t.activeThisWeek + " из " + t.withResults : "—", "Тренировались за 7 дней", t.hiddenResults ? plural(t.hiddenResults, "клиент", "клиента", "клиентов") + " без доступа" : "")}${kpi(adh, "Регулярность", "от недельной цели")}${kpi(t.needAttention, "Нужно внимание", "ждут ответа или давно не тренировались", t.needAttention ? "warn" : "")}</div>
      <div class="card"><div class="row"><b>Тренировки клиентов по неделям</b><span class="muted tiny">${t.workouts7} за 7 дн.</span></div>${weekBars(d.team.weekly, d.team.weekStarts)}</div>
      ${requests.length ? `<h2>Новые запросы (${requests.length})</h2>${requests.map(c => `<div class="card"><div class="row"><div><b>${esc(c.name)}</b>${c.request ? `<div class="muted tiny">«${esc(c.request)}»</div>` : ""}</div><div class="cl-act"><button data-act="accept" data-id="${c.linkId}" type="button">Принять</button><button class="ghost" data-act="decline" data-id="${c.linkId}" type="button">Отклонить</button></div></div></div>`).join("")}` : ""}
      <h2>Мои клиенты</h2>
      ${active.length ? `<div class="chips" id="cfilters">${FILTERS.map(f => `<button type="button" class="ghost ${ui.filter === f[0] ? "on" : ""}" data-f="${f[0]}">${f[1]}${f[2] ? ` <span class="cnt">${f[2]}</span>` : ""}</button>`).join("")}</div>
        <input id="cq" type="search" placeholder="Найти клиента по имени" value="${esc(ui.q)}" maxlength="60" style="width:100%;margin-bottom:6px" aria-label="Поиск клиента">
        <div id="clist">${list.map(card).join("") || '<div class="card"><p class="muted">Нет клиентов с такими условиями.</p></div>'}</div>`
        : '<div class="card"><p class="muted">Пока нет активных клиентов. Клиенты находят вас в разделе «Тренеры»; запрос можно отправить с тарифом «Персональный тренер».</p></div>'}
      ${ended.length ? `<details class="card"><summary><b>Завершённые (${ended.length})</b></summary>${ended.map(c => `<div class="row" style="margin-top:10px"><span>${esc(c.name)}</span><a class="btn ghost-btn tiny-btn" href="#/chat/${c.linkId}">Переписка</a></div>`).join("")}</details>` : ""}
      <p class="muted tiny">${DISCLAIMER}</p>`;
    app.querySelectorAll("[data-act]").forEach(b => b.onclick = async () => { await acc.linkAction(b.dataset.id, b.dataset.act); P.coach(FW); });
    app.querySelectorAll("#cfilters [data-f]").forEach(b => b.onclick = () => { ui.filter = b.dataset.f; P.coach(FW); });
    const q = document.getElementById("cq");
    if (q) q.oninput = () => {
      ui.q = q.value.trim();
      const box = document.getElementById("clist");
      box.innerHTML = active.filter(pass).sort(cmp).map(card).join("") || '<div class="card"><p class="muted">Нет клиентов с такими условиями.</p></div>';
    };
  };

  // ---------- один клиент ----------
  P.clientView = async function (FW, id) {
    if (!(await gate(FW, "Клиент"))) return;
    const { app, esc } = FW, acc = A();
    const r = await acc.coachClient(id);
    if (!r.ok) { app.innerHTML = `<a class="back" href="#/coach">← Клиенты</a><h1>Клиент</h1><div class="card"><p class="muted">${esc(errText(r))}</p></div>`; return; }
    const b = r.data, c = b.client, s = b.stats, ser = b.series, g = b.goals, C = window.Catalog, PL = window.Planner;
    const active = c.status === "active";
    const lock = what => `<div class="card lockcard"><span class="lk">${ic("user", 20)}</span><div><b>Клиент не открыл ${what}</b><p class="muted">Попросите открыть доступ в чате: клиент включает его сам и может отозвать в любой момент.</p><a class="btn ghost-btn tiny-btn" href="#/chat/${c.linkId}">Написать клиенту</a></div></div>`;
    const target = g && g.days ? g.days : null;
    const delta = s && s.weightDelta !== null ? (s.weightDelta > 0 ? "+" : "") + s.weightDelta + " кг за период" : "";
    app.innerHTML = `<a class="back" href="#/coach">← Клиенты</a>
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
        <textarea id="tnote" rows="4" maxlength="1000" placeholder="Что важно помнить: ограничения, договорённости, план на ближайшие недели">${esc(b.trainerNote)}</textarea>
        <div class="row"><span class="status" id="nstat" role="status"></span><button type="button" id="nsave">Сохранить</button></div></div>
      <div class="cl-act wrap"><a class="btn" href="#/chat/${c.linkId}">Открыть чат</a>${active ? `<button type="button" class="ghost" id="cend">Завершить работу с клиентом</button>` : ""}</div>
      <p class="muted tiny">${DISCLAIMER}</p>`;
    const save = document.getElementById("nsave");
    save.onclick = async () => {
      const st = document.getElementById("nstat");
      const res = await acc.coachNote(c.linkId, document.getElementById("tnote").value);
      st.textContent = res.ok ? "Сохранено" : errText(res);
      st.classList.toggle("ok", !!res.ok);
    };
    const end = document.getElementById("cend");
    if (end) end.onclick = async () => { if (confirm("Завершить работу с этим клиентом? Доступ к его данным закроется.")) { await acc.linkAction(c.linkId, "end"); location.hash = "#/coach"; } };
  };
})();
