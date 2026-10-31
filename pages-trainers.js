// Страницы тарифов, закрытых программ, тренеров, чата и администратора. Подключается до app.js.
(function () {
  "use strict";
  const P = (window.PAGES = window.PAGES || {});
  const A = () => window.Account;
  const TIER = { free: "Бесплатный", premium: "Премиум", personal: "Персональный тренер" };
  const STATUS = { requested: "Ждёт ответа", active: "Идёт", declined: "Отклонён", ended: "Завершён" };
  const DISCLAIMER = "Тренер не ставит диагнозы и не назначает лечение. При боли, травмах и болезнях сначала обратитесь к врачу.";
  const errText = r => (r.error === "offline" ? "Сервер недоступен" : r.error);
  let timer = null;
  P._cleanup = () => { if (timer) { clearInterval(timer); timer = null; } };

  // Общий вход: нужен вход в аккаунт; иначе предложение войти.
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

  // ---- тарифы ----
  P.tariffs = async function (FW) {
    if (!(await gate(FW, "Тарифы"))) return;
    const { app, esc } = FW, acc = A();
    const r = await acc.subscription();
    if (!r.ok) { app.innerHTML = `<h1>Тарифы</h1><div class="card"><p class="muted">${esc(errText(r))}</p></div>`; return; }
    const cur = r.data.tier, until = r.data.until ? new Date(r.data.until).toLocaleDateString("ru-RU") : "";
    app.innerHTML = `<h1>Тарифы</h1>${P.ideaChips(["A25", "A26", "K6"])}
      <p class="muted">Сейчас: <b>${esc(TIER[cur])}</b>${until ? ", действует до " + until : ""}.</p>
      ${r.data.tiers.map(t => `<div class="card tier ${t.id === cur ? "cur" : ""}"><div class="row"><b>${esc(t.title)}</b><span class="pill ${t.id === cur ? "done" : ""}">${t.id === cur ? "Ваш тариф" : esc(t.price)}</span></div><ul>${t.features.map(f => `<li>${esc(f)}</li>`).join("")}</ul></div>`).join("")}
      <form id="promo" class="card"><label><b>Промокод</b></label><div class="row" style="gap:8px"><input name="code" placeholder="Например, FW-AB12CD34" maxlength="24" autocomplete="off" style="flex:1"><button type="submit">Применить</button></div>
        <div class="status" id="perr" role="alert"></div></form>
      <p class="muted tiny">Оплата пока не подключена: тариф выдаётся промокодом. Платёжный провайдер ещё не выбран.</p>
      <div class="row" style="gap:8px"><a class="btn" href="#/premium">Расширенные программы</a><a class="btn ghost-btn" href="#/trainers">Тренеры</a></div>`;
    document.getElementById("promo").onsubmit = async ev => {
      ev.preventDefault();
      const out = document.getElementById("perr"), rr = await acc.redeem(ev.target.elements.code.value);
      if (!rr.ok) { out.textContent = errText(rr); return; }
      window.FX.toast("Тариф: " + TIER[rr.data.tier], "diamond"); window.FX.play("level");
      P.tariffs(FW);
    };
  };

  // ---- расширенные программы ----
  const weekOf = {};
  const phaseFor = (p, w) => p.phases.find(ph => { const [a, b] = String(ph.weeks).split("–").map(Number); return w >= a && w <= (b || a); }) || p.phases[0];
  const itemOut = (p, w, it) => { const ph = phaseFor(p, w); return { ex: it.ex, sets: it.sets || ph.sets, reps: it.reps || ph.reps, rest: it.rest != null ? it.rest : ph.rest }; };

  P.premium = async function (FW) {
    if (!(await gate(FW, "Расширенные программы"))) return;
    const { app, esc } = FW, r = await A().programs();
    if (!r.ok) { app.innerHTML = `<h1>Расширенные программы</h1><div class="card"><p class="muted">${esc(errText(r))}</p></div>`; return; }
    app.innerHTML = `<a class="back" href="#/programs">← Тренировки</a><h1>Расширенные программы</h1><p class="muted">Программы на 4–8 недель с ростом нагрузки. Ваш тариф: <b>${esc(TIER[r.data.tier])}</b>. Это черновики: перед использованием их стоит показать тренеру.</p>` +
      r.data.items.map(p => `<a class="card" href="${p.locked ? "#/tariffs" : "#/pp/" + p.id}"><div class="row"><div><b><span class="ti">${window.Icons.svg(p.icon, 18)}</span>${esc(p.title)}</b><div class="muted">${esc(p.description)}</div><div class="muted tiny">${p.weeks} нед. · ${p.dayCount} дн. в неделю · ${esc(p.place)}</div></div><span class="pill ${p.locked ? "" : "done"}">${p.locked ? window.Icons.svg("lock", 14) + " по подписке" : "Открыть"}</span></div></a>`).join("");
  };

  P.premiumProgram = async function (FW, id) {
    if (!(await gate(FW, "Программа"))) return;
    const { app, esc } = FW, r = await A().programs();
    const p = r.ok && r.data.items.find(x => x.id === id);
    if (!p) return FW.notFound();
    if (p.locked) { app.innerHTML = `<a class="back" href="#/premium">← Программы</a><h1>${esc(p.title)}</h1><div class="card"><p>Эта программа открывается по подписке «Премиум» или выше.</p><a class="btn" href="#/tariffs">Открыть по подписке</a></div>`; return; }
    const w = weekOf[id] || 1, ph = phaseFor(p, w);
    app.innerHTML = `<a class="back" href="#/premium">← Программы</a><h1><span class="ti">${window.Icons.svg(p.icon, 26)}</span>${esc(p.title)}</h1><p class="muted">${esc(p.description)}</p>
      <div class="card"><label><b>Неделя программы</b></label><select id="wk">${Array.from({ length: p.weeks }, (_, i) => `<option value="${i + 1}" ${i + 1 === w ? "selected" : ""}>Неделя ${i + 1}</option>`).join("")}</select>
        <p style="margin:10px 0 0"><b>Сейчас:</b> ${ph.sets} × ${esc(ph.reps)}${ph.rest ? ", отдых " + ph.rest + " сек" : ""}. <span class="muted">${esc(ph.note)}</span></p></div>
      <h2>Фазы</h2><div class="card">${p.phases.map(x => `<div class="row"><span>Недели ${esc(x.weeks)}</span><span class="muted">${x.sets} × ${esc(x.reps)} · ${esc(x.note)}</span></div>`).join("")}</div>
      <h2>Дни</h2>${p.days.map(d => `<a class="card" href="#/ppd/${p.id}/${d.id}"><div class="row"><div><b>${esc(d.title)}</b><div class="muted">${d.items.map(i => esc((window.Catalog.byId(i.ex) || { title: i.ex }).title)).join(" · ")}</div></div><span class="pill">+${window.DAY_POINTS}</span></div></a>`).join("")}`;
    document.getElementById("wk").onchange = ev => { weekOf[id] = Number(ev.target.value); P.premiumProgram(FW, id); };
  };

  P.premiumDay = async function (FW, pid, did, justDone) {
    if (!(await gate(FW, "Тренировка"))) return;
    const { app, esc } = FW, r = await A().programs();
    const p = r.ok && r.data.items.find(x => x.id === pid), d = p && !p.locked && p.days.find(x => x.id === did);
    if (!d) return FW.notFound();
    const w = weekOf[pid] || 1;
    app.innerHTML = `<a class="back" href="#/pp/${p.id}">← ${esc(p.title)}</a><h1>${esc(d.title)}</h1><p class="muted">Неделя ${w}. Разомнитесь 3–5 минут, затем выполните план.</p>` +
      d.items.map((it, n) => { const o = itemOut(p, w, it), e = window.Catalog.byId(o.ex) || { title: o.ex };
        return `<div class="card"><div class="row"><div><b>${n + 1}. ${esc(e.title)}</b><div>${o.sets} × ${esc(o.reps)}${o.rest ? " · отдых " + o.rest + " сек" : ""}</div></div><a class="pill" href="#/x/${o.ex}">${e.video ? "▶ видео" : "техника"}</a></div></div>`; }).join("") + '<div id="checkin"></div>';
    FW.renderCheckin({ id: "pp-" + p.id }, { id: d.id, title: p.title + ": " + d.title }, justDone, () => P.premiumDay(FW, pid, did, true));
  };

  // ---- тренеры (клиент) ----
  P.trainers = async function (FW) {
    if (!(await gate(FW, "Тренеры"))) return;
    const { app, esc } = FW, acc = A();
    const [sub, tl, ln, me] = await Promise.all([acc.subscription(), acc.trainers(), acc.links(), acc.trainerMe()]);
    if (!sub.ok || !tl.ok || !ln.ok) { app.innerHTML = `<h1>Тренеры</h1><div class="card"><p class="muted">${esc(errText(!sub.ok ? sub : !tl.ok ? tl : ln))}</p></div>`; return; }
    const personal = sub.data.tier === "personal", mine = ln.data.items.filter(l => l.role === "client"), prof = me.ok ? me.data.profile : null;
    const myLinks = mine.length ? mine.map(l => `<div class="card"><div class="row"><div><b>${esc(l.with.name)}</b><div class="muted tiny">${STATUS[l.status]}</div></div>
        <div>${l.status === "active" || l.status === "ended" ? `<a class="btn" href="#/chat/${l.id}">Чат</a>` : ""}${l.status === "requested" ? `<button class="ghost" data-end="${l.id}" type="button">Отменить</button>` : ""}${l.status === "active" ? ` <button class="ghost" data-end="${l.id}" type="button">Завершить</button>` : ""}</div></div></div>`).join("") : '<p class="muted">Пока никого.</p>';
    const trainers = tl.data.items.length ? tl.data.items.map(t => `<div class="card"><b>${esc(t.name)}</b><p>${esc(t.bio)}</p>${t.specialties ? `<p class="muted tiny">${esc(t.specialties)}</p>` : ""}
        ${personal ? `<div class="row" style="gap:8px"><input data-note="${t.id}" placeholder="Что хотите: цель, ограничения (необязательно)" maxlength="300" style="flex:1"><button data-req="${t.id}" type="button">Запросить</button></div>`
          : `<a class="btn ghost-btn" href="#/tariffs">Нужна подписка «Персональный тренер»</a>`}</div>`).join("") : '<p class="muted">Подтверждённых тренеров пока нет.</p>';
    const coach = prof && prof.status === "approved";
    app.innerHTML = `<a class="back" href="#/programs">← Тренировки</a><h1>Тренеры</h1>${window.Guide.tip("trainers")}${P.ideaChips(["A7", "K4"])}
      <div class="card warn"><p class="muted" style="margin:0">${DISCLAIMER}</p></div>
      ${coach ? '<a class="btn" href="#/coach">Клиенты и дашборды</a>' : ""}
      <h2>Мои тренеры</h2>${myLinks}<h2>Выбрать тренера</h2><div class="status" id="terr" role="alert"></div>${trainers}
      <h2>Стать тренером</h2>${prof ? `<div class="card"><p>Ваша заявка: <b>${{ pending: "на проверке", approved: "подтверждена", rejected: "отклонена" }[prof.status]}</b>.</p>${prof.status === "rejected" ? "<p class='muted'>Можно исправить описание и подать снова.</p>" : ""}</div>` : ""}
      ${coach ? "" : `<form id="apply" class="card"><label><b>О себе</b></label><textarea name="bio" rows="3" maxlength="1000" placeholder="Опыт, образование, с кем работаете (от 20 символов)">${prof ? esc(prof.bio) : ""}</textarea>
        <label><b>Специализация</b></label><input name="spec" maxlength="200" placeholder="Например: сила, похудение, растяжка" value="${prof ? esc(prof.specialties) : ""}" style="width:100%">
        <div class="status" id="aerr" role="alert"></div><button type="submit">Отправить заявку</button><p class="muted tiny">Заявку подтверждает администратор.</p></form>`}`;
    app.querySelectorAll("[data-end]").forEach(b => b.onclick = async () => { await acc.linkAction(b.dataset.end, "end"); P.trainers(FW); });
    app.querySelectorAll("[data-req]").forEach(b => b.onclick = async () => {
      const note = app.querySelector(`[data-note="${b.dataset.req}"]`).value.trim(), r = await acc.requestTrainer(b.dataset.req, note);
      if (!r.ok) { document.getElementById("terr").textContent = errText(r); return; }
      window.FX.toast("Запрос отправлен", "mail"); P.trainers(FW);
    });
    const ap = document.getElementById("apply");
    if (ap) ap.onsubmit = async ev => {
      ev.preventDefault();
      const f = ev.target.elements, r = await acc.trainerApply(f.bio.value, f.spec.value);
      if (!r.ok) { document.getElementById("aerr").textContent = errText(r); return; }
      window.FX.toast("Заявка отправлена", "check"); P.trainers(FW);
    };
  };

  // ---- чат ----
  P.chat = async function (FW, id) {
    if (!(await gate(FW, "Чат"))) return;
    const { app, esc } = FW, acc = A();
    const ln = await acc.links(), l = ln.ok && ln.data.items.find(x => String(x.id) === String(id));
    if (!l) return FW.notFound();
    const isClient = l.role === "client", closed = l.status !== "active";
    app.innerHTML = `<a class="back" href="${isClient ? "#/trainers" : "#/coach"}">← Назад</a><h1>${esc(l.with.name)}</h1><p class="muted tiny">${DISCLAIMER}</p>
      ${isClient && !closed ? `<div class="card"><b>Что видит тренер</b><label class="chk"><input type="checkbox" id="sg" ${l.shareGoals ? "checked" : ""}> Цели, уровень и ограничения</label><label class="chk"><input type="checkbox" id="sr" ${l.shareResults ? "checked" : ""}> Тренировки, вес и рост</label><p class="muted tiny">По умолчанию тренер ничего не видит. Согласие можно отозвать в любой момент.</p></div>` : ""}
      <div class="chat" id="msgs" aria-live="polite"></div>
      ${closed ? `<p class="muted">Переписка завершена: сообщения доступны только для чтения.</p>` : `<form id="mform" class="row" style="gap:8px"><input name="body" maxlength="2000" placeholder="Сообщение" autocomplete="off" style="flex:1"><button type="submit">Отправить</button></form><div class="status" id="merr" role="alert"></div>`}`;
    const box = document.getElementById("msgs");
    let last = 0;
    const load = async () => {
      const r = await acc.messages(id, last);
      if (!r.ok || !document.getElementById("msgs")) return;
      r.data.items.forEach(m => { last = Math.max(last, m.id); const d = document.createElement("div"); d.className = "msg" + (m.mine ? " me" : ""); d.textContent = m.body; box.appendChild(d); });
      if (r.data.items.length) box.lastElementChild.scrollIntoView && box.lastElementChild.scrollIntoView({ block: "end" });
    };
    await load();
    if (!closed) timer = setInterval(load, 5000);
    const sg = document.getElementById("sg"), sr = document.getElementById("sr");
    if (sg) sg.onchange = async () => { const r = await acc.setShare(id, { goals: sg.checked }); if (!r.ok) sg.checked = !sg.checked; };
    if (sr) sr.onchange = async () => { const r = await acc.setShare(id, { results: sr.checked }); if (!r.ok) sr.checked = !sr.checked; };
    const mf = document.getElementById("mform");
    if (mf) mf.onsubmit = async ev => {
      ev.preventDefault();
      const inp = mf.elements.body, text = inp.value.trim();
      if (!text) return;
      const r = await acc.sendMessage(id, text);
      document.getElementById("merr").textContent = r.ok ? "" : errText(r);
      if (r.ok) { inp.value = ""; await load(); }
    };
  };

  // ---- администратор ----
  P.admin = async function (FW) {
    if (!(await gate(FW, "Администратор"))) return;
    const { app, esc } = FW, acc = A();
    if (!acc.state.user.isAdmin) { app.innerHTML = '<h1>Администратор</h1><div class="card"><p class="muted">Нет доступа.</p></div>'; return; }
    const [tr, pr] = await Promise.all([acc.adminTrainers("pending"), acc.adminPromoList()]);
    app.innerHTML = `<h1>Администратор</h1>
      <h2>Заявки тренеров (${tr.ok ? tr.data.items.length : 0})</h2>${tr.ok && tr.data.items.length ? tr.data.items.map(t => `<div class="card"><b>${esc(t.name)}</b> <span class="muted tiny">${esc(t.email || "вход через Telegram")}</span><p>${esc(t.bio)}</p><p class="muted tiny">${esc(t.specialties)}</p>
        <button data-v="approve" data-id="${t.id}" type="button">Подтвердить</button> <button class="ghost" data-v="reject" data-id="${t.id}" type="button">Отклонить</button></div>`).join("") : '<p class="muted">Нет новых заявок.</p>'}
      <h2>Промокоды</h2><form id="pform" class="card"><div class="row" style="gap:8px"><select name="tier"><option value="premium">Премиум</option><option value="personal">Персональный тренер</option></select>
        <input name="days" type="number" min="1" max="366" value="30" style="width:90px" aria-label="Дней"><input name="max" type="number" min="1" max="1000" value="1" style="width:90px" aria-label="Использований"></div>
        <input name="code" placeholder="Код (необязательно)" maxlength="24" style="width:100%;margin-top:8px"><div class="status" id="pmsg" role="status"></div><button type="submit">Создать код</button></form>
      ${pr.ok ? pr.data.items.map(c => `<div class="card row"><span><b>${esc(c.code)}</b> <span class="muted tiny">${TIER[c.tier]}, ${c.days} дн.</span></span><span class="muted">${c.used}/${c.maxUses}</span></div>`).join("") : ""}`;
    app.querySelectorAll("[data-v]").forEach(b => b.onclick = async () => { await acc.adminVerdict(b.dataset.id, b.dataset.v); P.admin(FW); });
    document.getElementById("pform").onsubmit = async ev => {
      ev.preventDefault();
      const f = ev.target.elements, r = await acc.adminPromoCreate({ tier: f.tier.value, days: Number(f.days.value), maxUses: Number(f.max.value), code: f.code.value.trim() || undefined });
      if (!r.ok) { document.getElementById("pmsg").textContent = errText(r); return; }
      P.admin(FW);
    };
  };
})();
