// Запись тренировки (подходы, повторения, вес, таймер), итог тренировки и статистика по неделям, месяцам и году.
// Подключается до app.js. Расчёты — в stats.js, данные и отправка на сервер — в app.js (через FW).
(function () {
  "use strict";
  const P = (window.PAGES = window.PAGES || {});
  const S = () => window.Stats, C = () => window.Catalog, ic = (n, s) => window.Icons.svg(n, s);
  const label = id => (C().MUSCLES.find(m => m.id === id) || { label: id }).label;
  const dd = d => d.slice(8, 10) + "." + d.slice(5, 7);
  const num = v => Number(String(v).replace(",", "."));
  const slug = s => (/^[a-z0-9_-]{1,24}$/.test(s) ? s : String(s).toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24) || "ex");
  const NBSP = / /g;

  // ---------- общее ----------
  const parsed = d => ({ items: d.items.map(it => ({ ex: it.ex, name: it.name, sets: it.sets.map(s => ({ reps: Math.round(num(s.reps)) || 0, kg: Math.max(0, num(s.kg) || 0) })) })) });
  const hasData = d => !!d && d.items.some(it => it.sets.some(s => String(s.reps).trim() !== "" || String(s.kg).trim() !== ""));
  // Прошлые значения этого упражнения: подсказка в пустых полях («в прошлый раз 8 × 60»).
  function lastSession(FW, ex) {
    const list = FW.state.sessions.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    for (const s of list) { const it = s.items.find(x => x.ex === ex); if (it) return { sets: it.sets, rpe: s.rpe || null }; }
    return null;
  }
  function lastSets(FW, ex) { const l = lastSession(FW, ex); return l ? l.sets : null; }
  const hintFor = (FW, ex, i) => { const l = lastSets(FW, ex); if (!l) return ""; const s = l[Math.min(i, l.length - 1)]; return s.reps + "×" + String(s.kg).replace(".", ","); };
  // Цель на сегодня по прошлой тренировке: «9 × 24 кг (в прошлый раз 8 × 24)».
  const kgTxt = v => String(v).replace(".", ",");
  function goalLine(FW, ex) {
    const ls = lastSession(FW, ex), prev = ls && ls.sets, t = prev && S().nextTarget(prev, ls.rpe); if (!t) return "";
    const top = prev.reduce((a, b) => (num(b.kg) > num(a.kg) || (num(b.kg) === num(a.kg) && num(b.reps) > num(a.reps)) ? b : a));
    const was = top.reps + (num(top.kg) > 0 ? " × " + kgTxt(top.kg) + " кг" : " повт.");
    const goal = t.kg > 0 ? t.reps + " × " + kgTxt(t.kg) + " кг" : t.reps + " повт.";
    return `<div class="lg-goal"><b>Цель: ${goal}</b><span class="muted tiny"> · в прошлый раз ${was}${t.kind === "weight" ? ". Дошёл до 12, добавь вес" : t.kind === "easy" ? ". Было легко, добавь вес" : t.kind === "hold" ? ". Было тяжело, повтори то же" : ""}</span></div>`;
  }
  const newSet = (FW, ex, i, base) => ({ reps: "", kg: "", hint: hintFor(FW, ex, i) || base || "" });
  const blankDraft = FW => ({ id: FW.newId(), startedAt: Date.now(), title: "Тренировка", src: null, items: [] });
  const startDay = (FW, src) => {
    const st = FW.state, d = blankDraft(FW);
    d.src = src;
    let day = null, name = null;
    if (src.p === "plan") {
      day = st.plan && st.plan.days.find(x => x.id === src.d);
      if (day) { name = day.title; d.items = day.items.map(i => { const e = C().byId(i.ex); return e ? { ex: e.id, name: e.title, sets: Array.from({ length: Math.min(30, i.sets || 3) }, (_, n) => newSet(FW, e.id, n, parseInt(i.reps, 10) ? String(parseInt(i.reps, 10)) : "")) } : null; }).filter(Boolean); }
    } else {
      const prog = window.PROGRAMS.find(x => x.id === src.p);
      day = prog && prog.days.find(x => x.id === src.d);
      if (day) {
        name = day.title;
        d.items = day.items.map(i => {
          const pe = prog.exercises.find(x => x.id === i.ex), cat = C().EXERCISES.find(x => x.ref === prog.id + "/" + i.ex) || C().byId(i.ex);
          const id = cat ? cat.id : slug(i.ex);
          return { ex: id, name: (pe && pe.title) || (cat && cat.title) || i.ex, sets: Array.from({ length: Math.min(30, i.sets || 3) }, (_, n) => newSet(FW, id, n, parseInt(i.reps, 10) ? String(parseInt(i.reps, 10)) : "")) };
        });
      }
    }
    if (!day) return null;
    d.title = String(name).slice(0, 80);
    return d;
  };
  const repeatOf = (FW, s) => { const d = blankDraft(FW); d.title = s.title; d.items = s.items.map(it => ({ ex: it.ex, name: it.name, sets: it.sets.map(v => ({ reps: "", kg: "", hint: v.reps + "×" + String(v.kg).replace(".", ",") })) })); return d; };

  let timer = null, celebrated = "";
  const prevCleanup = P._cleanup;
  P._cleanup = () => { if (timer) { clearInterval(timer); timer = null; } if (prevCleanup) prevCleanup(); };

  // ---------- запись тренировки ----------
  P.log = function (FW, a, b) {
    const { app, esc } = FW, st = FW.state, nav = FW.nav();
    // Из каталога: «Добавить в тренировку» кладёт упражнение в идущую тренировку (или начинает новую) и открывает запись.
    if (a === "ex") {
      const e = C().byId(b); if (!e) return FW.notFound();
      if (!st.draft) st.draft = blankDraft(FW);
      if (!st.draft.items.some(i => i.ex === e.id) && st.draft.items.length < 20) st.draft.items.push({ ex: e.id, name: e.title, sets: [newSet(FW, e.id, 0)] });
      FW.save(); location.replace("#/log"); return;
    }
    const src = a && b ? { p: a, d: b } : null;
    const go = d => { st.draft = d; FW.save(); P.log(FW); };

    // Нет черновика: экран старта. Пришли из дня программы или плана — тренировка с готовыми упражнениями начинается сама.
    if (src && (!st.draft || !st.draft.src || st.draft.src.p !== src.p || st.draft.src.d !== src.d)) {
      if (hasData(st.draft)) {
        app.innerHTML = `<a class="back" href="#/log">← Назад</a><h1>Есть начатая тренировка</h1><div class="card"><p>У тебя уже идёт тренировка «${esc(st.draft.title)}» с записанными подходами. Что сделать?</p>
          <div class="cl-act wrap"><a class="btn" href="#/log">Продолжить её</a><button type="button" class="ghost" id="lnew">Начать новую (старая сотрётся)</button></div></div>`;
        document.getElementById("lnew").onclick = () => { const d = startDay(FW, src); if (d) go(d); else FW.notFound(); };
        return;
      }
      const d = startDay(FW, src);
      if (!d) return FW.notFound();
      st.draft = d; FW.save();
    }
    if (!st.draft) {
      const last = st.sessions.slice().sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0))[0];
      const planDays = st.plan ? st.plan.days.map(x => `<a class="card row-link" href="#/log/plan/${esc(x.id)}"><span class="oi">${ic("calendar", 22)}</span><div class="rl-tx"><b>${esc(x.title)}</b><div class="muted">Из моего плана: упражнения уже подставлены</div></div><span class="chev" aria-hidden="true">›</span></a>`).join("") : "";
      app.innerHTML = `<a class="back" href="#/programs">← Тренировки</a><h1>Запись тренировки</h1>
        <p class="muted">Записывай подходы, повторения и вес. В конце увидишь, сколько всего поднял и сколько времени заняла тренировка. Готовую программу можно просто отметить как сделанную, подходы тогда записывать не нужно.</p>
        <button type="button" class="wide" id="lblank">Начать свою тренировку</button>
        ${last ? `<button type="button" class="ghost wide" id="lrepeat" style="margin-top:10px">Повторить: ${esc(last.title)} (${esc(dd(last.date))})</button>` : ""}
        ${planDays ? `<h2>Из плана</h2>${planDays}` : ""}
        <p class="muted tiny">Запись тренировки засчитывается как тренировка дня: баллы и серия, как при отметке программы.</p>`;
      document.getElementById("lblank").onclick = () => go(blankDraft(FW));
      const rep = document.getElementById("lrepeat");
      if (rep) rep.onclick = () => go(repeatOf(FW, last));
      return;
    }

    const d = st.draft, save = () => FW.save();
    const volumeNow = () => S().volume(parsed(d));
    const totalsHtml = () => { const v = volumeNow(); return `<span><b>${v.sets}</b> подходов</span><span><b>${esc(S().fmtKg(v.tonnage))}</b></span>`; };
    const exCard = (it, ii) => `<div class="card lg-ex" data-i="${ii}"><div class="row"><div><b>${esc(it.name)}</b><div class="muted tiny">${esc(((C().byId(it.ex) || {}).muscles || []).map(label).join(", "))}</div>${goalLine(FW, it.ex)}</div>
        <button type="button" class="ghost icon-only" data-rm-ex="${ii}" aria-label="Убрать упражнение ${esc(it.name)}">${ic("x", 16)}</button></div>
      <div class="lg-head"><span>№</span><span>Повторы</span><span>Вес, кг</span><span></span></div>
      ${it.sets.map((s, si) => `<div class="lg-set"><span class="lg-n">${si + 1}</span>
        <input inputmode="numeric" pattern="[0-9]*" maxlength="4" data-i="${ii}" data-s="${si}" data-f="reps" value="${esc(s.reps)}" placeholder="${esc((s.hint || "").split("×")[0] || "—")}" aria-label="Повторы, подход ${si + 1}">
        <input inputmode="decimal" maxlength="6" data-i="${ii}" data-s="${si}" data-f="kg" value="${esc(s.kg)}" placeholder="${esc((s.hint || "").split("×")[1] || "0")}" aria-label="Вес в кг, подход ${si + 1}">
        <button type="button" class="ghost icon-only" data-rm-set="${ii}:${si}" aria-label="Убрать подход ${si + 1}">${ic("x", 16)}</button></div>`).join("")}
      <button type="button" class="ghost tiny-btn" data-add-set="${ii}">+ Подход</button></div>`;
    app.innerHTML = `<a class="back" href="#/programs">← Тренировки</a>
      <div class="card lg-bar"><label for="ltitle" class="muted tiny">Название</label><input id="ltitle" maxlength="80" value="${esc(d.title)}"><div class="lg-clock" id="lclock" role="timer" aria-label="Время тренировки">0:00</div></div>
      <div id="litems">${d.items.map(exCard).join("") || `<div class="card"><p class="muted" style="margin:0">Добавь первое упражнение.</p></div>`}</div>
      <div class="card" id="lpick" ${d.items.length ? "hidden" : ""}><label for="lsearch"><b>Добавить упражнение</b></label><input id="lsearch" type="search" placeholder="Название: жим, присед, тяга…" autocomplete="off" style="width:100%"><div id="lres" class="lg-res"></div></div>
      <button type="button" class="ghost wide" id="ladd" ${d.items.length ? "" : "hidden"}>+ Добавить упражнение</button>
      <div id="lfin"></div>
      ${d.items.length ? `<a class="btn ghost-btn wide-btn" href="#/go">Пошаговый режим: по одному упражнению, с отдыхом</a>` : ""}
      <div class="lg-total" id="ltotal"><div class="lg-sum" id="lsum">${totalsHtml()}</div><button type="button" id="lfinish">Завершить</button></div>
      <p class="center"><button type="button" class="ghost tiny-btn" id="ldiscard">Отменить тренировку</button></p>`;

    const clock = document.getElementById("lclock");
    const tick = () => { clock.textContent = S().fmtClock((Date.now() - d.startedAt) / 1000); };
    tick(); if (timer) clearInterval(timer); timer = setInterval(() => { if (!clock.isConnected) { clearInterval(timer); timer = null; return; } tick(); }, 1000);
    const redraw = focus => { const y = window.scrollY; P.log(FW); window.scrollTo(0, y); if (focus) { const el = app.querySelector(focus); if (el && el.focus) el.focus(); } };
    const refreshSum = () => { document.getElementById("lsum").innerHTML = totalsHtml(); };

    document.getElementById("ltitle").oninput = ev => { d.title = ev.target.value.slice(0, 80); save(); };
    app.querySelector("#litems").oninput = ev => {
      const t = ev.target; if (!t.dataset || !t.dataset.f) return;
      // Только цифры и один разделитель: «8», «62,5».
      let v = t.value.replace(/[^0-9.,]/g, "");
      if (t.dataset.f === "reps") v = v.replace(/[.,].*/, ""); else v = v.replace(/([.,]).*?[.,].*/, "$1").replace(/^([0-9]*[.,][0-9]).*$/, "$1");
      if (v !== t.value) t.value = v;
      d.items[+t.dataset.i].sets[+t.dataset.s][t.dataset.f] = v;
      save(); refreshSum();
    };
    app.querySelector("#litems").onclick = ev => {
      const b = ev.target.closest ? ev.target.closest("button") : null;
      if (!b) return;
      if (b.dataset.addSet !== undefined) {
        const ii = +b.dataset.addSet, it = d.items[ii], prev = it.sets[it.sets.length - 1];
        it.sets.push({ reps: "", kg: "", hint: prev && (prev.reps || prev.kg) ? (prev.reps || "") + "×" + (prev.kg || "") : hintFor(FW, it.ex, it.sets.length) });
        save(); redraw(`[data-i="${ii}"][data-s="${it.sets.length - 1}"][data-f="reps"]`);
      } else if (b.dataset.rmSet !== undefined) {
        const [ii, si] = b.dataset.rmSet.split(":").map(Number), it = d.items[ii];
        if (it.sets.length > 1) it.sets.splice(si, 1); else d.items.splice(ii, 1);
        save(); redraw();
      } else if (b.dataset.rmEx !== undefined) { d.items.splice(+b.dataset.rmEx, 1); save(); redraw(); }
    };
    // Выбор упражнения: сначала недавние, потом по поиску.
    const res = document.getElementById("lres"), search = document.getElementById("lsearch");
    const recent = () => { const seen = new Set(), out = []; st.sessions.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).forEach(s => s.items.forEach(it => { if (!seen.has(it.ex) && C().byId(it.ex)) { seen.add(it.ex); out.push(C().byId(it.ex)); } })); return out; };
    const drawRes = () => {
      const q = search.value.trim();
      const list = q ? C().filter(C().EXERCISES, { q }).slice(0, 10) : recent().slice(0, 6).concat(C().EXERCISES.filter(e => e.kind === "strength").slice(0, 6)).filter((e, i, a) => a.findIndex(x => x.id === e.id) === i).slice(0, 8);
      res.innerHTML = list.length ? list.map(e => `<button type="button" class="ghost lg-pick" data-add="${esc(e.id)}"><b>${esc(e.title)}</b><small>${esc(e.muscles.map(label).join(", "))}</small></button>`).join("") : '<p class="muted tiny">Ничего не найдено.</p>';
    };
    search.oninput = drawRes; drawRes();
    res.onclick = ev => {
      const b = ev.target.closest ? ev.target.closest("[data-add]") : null; if (!b) return;
      const e = C().byId(b.dataset.add); if (!e || d.items.length >= 20) return;
      d.items.push({ ex: e.id, name: e.title, sets: [newSet(FW, e.id, 0)] });
      save(); redraw(`[data-i="${d.items.length - 1}"][data-s="0"][data-f="reps"]`);
    };
    document.getElementById("ladd").onclick = () => { const p = document.getElementById("lpick"); p.hidden = false; document.getElementById("ladd").hidden = true; search.focus(); };

    // Завершение: подтверждение длительности (таймер мог идти дольше, если забыл нажать «Завершить»).
    document.getElementById("lfinish").onclick = () => {
      if (!parsed(d).items.some(it => it.sets.some(s => s.reps > 0))) { document.getElementById("lfin").innerHTML = '<div class="card warn"><p style="margin:0">Запиши хотя бы один подход: сколько повторений сделал.</p></div>'; return; }
      const min = Math.max(1, Math.min(600, Math.round((Date.now() - d.startedAt) / 60000)));
      document.getElementById("lfin").innerHTML = `<div class="card"><b>Завершить тренировку</b><label for="lmin" class="muted">Сколько минут заняла тренировка?</label>
        <input id="lmin" type="number" inputmode="numeric" min="1" max="600" value="${min}" style="width:120px"><p class="muted tiny">По таймеру: ${min} мин. Исправь, если забыл завершить вовремя.</p>
        <div class="rpe"><span class="muted">Насколько тяжело было?</span><div class="chips" id="lrpe" role="group" aria-label="Тяжесть тренировки">${[[4, "Легко"], [7, "Нормально"], [9, "Тяжело"], [10, "На пределе"]].map(([v, l]) => `<button type="button" class="ghost" data-rpe="${v}" aria-pressed="false">${l}</button>`).join("")}</div><p class="muted tiny">Нужно для цели на следующий раз. Можно пропустить.</p></div>
        <div class="status" id="lerr" role="alert"></div><div class="cl-act wrap"><button type="button" id="lsave">Сохранить тренировку</button><button type="button" class="ghost" id="lcont">Продолжить</button></div></div>`;
      document.getElementById("lcont").onclick = () => { document.getElementById("lfin").innerHTML = ""; };
      let rpe = null;
      document.getElementById("lrpe").onclick = ev => { const b = ev.target.closest && ev.target.closest("[data-rpe]"); if (!b) return; rpe = rpe === Number(b.dataset.rpe) ? null : Number(b.dataset.rpe); document.querySelectorAll("#lrpe [data-rpe]").forEach(x => { const on = Number(x.dataset.rpe) === rpe; x.classList.toggle("on", on); x.setAttribute("aria-pressed", String(on)); }); };
      document.getElementById("lsave").onclick = () => {
        const m = Math.round(num(document.getElementById("lmin").value));
        if (!(m >= 1 && m <= 600)) { document.getElementById("lerr").textContent = "Минуты: от 1 до 600."; return; }
        const s = FW.finishSession(d, m, rpe);
        if (!s) { document.getElementById("lerr").textContent = "Нет ни одного подхода с повторениями."; return; }
        if (d.src && d.src.p === "trainer" && window.Account.assignmentDone) window.Account.assignmentDone(d.src.d, s.id);
        FW.go("#/session/" + s.id + "/new");
      };
      document.getElementById("lmin").focus();
    };
    document.getElementById("ldiscard").onclick = () => { if (confirm("Отменить тренировку? Записанные подходы пропадут.")) { st.draft = null; FW.save(); FW.go("#/programs"); } };
    if (FW.stale(nav)) return;
  };

  // ---------- итог тренировки ----------
  P.session = async function (FW, id, flag) {
    const { app, esc } = FW, st = FW.state, nav = FW.nav();
    const s = st.sessions.find(x => x.id === id);
    if (!s) return FW.notFound();
    const v = S().volume(s), ms = S().muscleSets(s, FW.muscleOf), fresh = flag === "new";
    const muscles = Object.keys(ms).sort((a, b) => ms[b] - ms[a]);
    app.innerHTML = `<a class="back" href="#/stats">← Статистика</a>
      ${fresh ? `<div class="celebrate"><span class="em">${ic("trophy", 54)}</span><b>Тренировка записана!</b></div>` : ""}
      <h1>${esc(s.title)}</h1><p class="muted">${esc(dd(s.date))}${s.pending ? " · ждёт отправки на сервер" : ""}</p>
      <div class="kpis kpis3"><div class="card kpi"><div class="kv">${esc(S().fmtTime(s.durationSec))}</div><div class="kl">Время</div></div><div class="card kpi"><div class="kv">${v.sets}</div><div class="kl">Подходов</div></div><div class="card kpi"><div class="kv">${esc(S().fmtKg(v.tonnage))}</div><div class="kl">Поднято всего</div></div></div>
      ${s.rpe ? `<p class="muted">Тяжесть: ${s.rpe} из 10${s.rpe >= 9 ? " (тяжело)" : s.rpe <= 5 ? " (легко)" : ""}</p>` : ""}
      ${s.items.map(it => `<div class="card"><b>${esc(it.name)}</b><div class="lg-lines">${it.sets.map((x, i) => `<span class="pill">${i + 1}: ${x.kg > 0 ? x.reps + " × " + esc(String(x.kg).replace(".", ",")) + " кг" : x.reps + " повт."}</span>`).join("")}</div></div>`).join("")}
      ${muscles.length ? `<div class="card"><b>Какие мышцы работали</b><div class="tags" style="margin-top:8px">${muscles.map(m => `<span class="tag">${esc(label(m))} · ${ms[m]}</span>`).join("")}</div></div>` : ""}
      <div class="card"><b>Отправить тренеру</b><p class="muted" style="margin:6px 0 10px">Тренер получит сообщение в чате: упражнения, подходы, вес и итоги.</p><div id="lsend"></div></div>
      <div class="cl-act wrap"><button type="button" class="ghost" id="lagain">Повторить тренировку</button><button type="button" class="ghost" id="ldel">Удалить запись</button></div>`;
    if (fresh && celebrated !== id) { celebrated = id; window.FX.celebrate(); }
    document.getElementById("lagain").onclick = () => {
      if (hasData(st.draft) && !confirm("Начатая тренировка будет заменена. Продолжить?")) return;
      st.draft = repeatOf(FW, s); FW.save(); FW.go("#/log");
    };
    document.getElementById("ldel").onclick = () => { if (confirm("Удалить запись о тренировке? Это нельзя отменить.")) { FW.removeSession(id); FW.go("#/stats"); } };

    // Отправка тренеру: нужен вход и действующий тренер; текст собирается из этой тренировки.
    const box = document.getElementById("lsend"), acc = window.Account;
    if (acc.state.status !== "user") { box.innerHTML = `<p class="muted tiny" style="margin:0">Войди в аккаунт, чтобы отправить тренировку тренеру.</p><a class="btn ghost-btn tiny-btn" href="#/account">Войти</a>`; return; }
    const ln = await acc.links();
    if (FW.stale(nav) || !box.isConnected) return;
    const mine = ln.ok ? ln.data.items.filter(l => l.role === "client" && l.status === "active") : [];
    if (!mine.length) { box.innerHTML = `<p class="muted tiny" style="margin:0">${ln.ok ? "Тренера пока нет. Выбрать его можно в разделе «Тренеры»." : "Сервер недоступен."}</p>`; return; }
    box.innerHTML = `${mine.length > 1 ? `<select id="lto" aria-label="Кому отправить">${mine.map(l => `<option value="${l.id}">${esc(l.with.name)}</option>`).join("")}</select> ` : ""}<button type="button" id="lsendbtn">${mine.length === 1 ? "Отправить тренеру " + esc(mine[0].with.name) : "Отправить"}</button><div class="status" id="lsmsg" role="status"></div>`;
    document.getElementById("lsendbtn").onclick = async ev => {
      const btn = ev.target, to = document.getElementById("lto") ? document.getElementById("lto").value : mine[0].id;
      btn.disabled = true;
      const r = await acc.sendMessage(to, S().summaryText(s, dd(s.date)).replace(NBSP, " "));
      const msg = document.getElementById("lsmsg");
      if (r.ok) { msg.textContent = "Отправлено в чат"; msg.classList.add("ok"); window.FX.toast("Тренировка отправлена тренеру", "check"); }
      else { btn.disabled = false; msg.classList.remove("ok"); msg.textContent = r.error === "offline" ? "Сервер недоступен" : r.error; }
    };
  };

  // ---------- статистика ----------
  P.stats = function (FW, period) {
    const { app, esc } = FW, st = FW.state, S0 = S();
    const per = ["week", "month", "year", "all"].includes(period) ? period : "week";
    const todayNum = S0.dayNum(FW.today()), names = Object.fromEntries(S0.LEVELS.map(l => [l.id, l.label]));
    const sum = S0.summarize(st.sessions, st.log, per, todayNum, FW.muscleOf, FW.markSets), weeks = S0.weekly(st.sessions, st.log, todayNum, 8);
    const labels = Object.fromEntries(C().MUSCLES.map(m => [m.id, m.label]));
    const levels = {}; Object.keys(sum.byMuscle).forEach(m => { levels[m] = sum.byMuscle[m].level; });
    const counts = S0.levelCounts(sum.byMuscle), keys = Object.keys(sum.byMuscle).sort((a, b) => sum.byMuscle[b].sets - sum.byMuscle[a].sets);
    const hist = st.sessions.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.startedAt || "") < (b.startedAt || "") ? 1 : -1)).slice(0, 20);
    const tabs = [["week", "Неделя"], ["month", "Месяц"], ["year", "Год"], ["all", "Всё"]].map(([v, l]) => `<a class="seg-b ${per === v ? "on" : ""}" href="#/stats/${v}" aria-current="${per === v}"><b>${l}</b></a>`).join("");
    const empty = !st.sessions.length && !sum.marks;
    const adv = per === "week" || per === "month" ? S0.coachAdvice(sum.byMuscle, label) : [];
    const advHtml = adv.length ? `<div class="card coach-note"><b>${ic("bulb", 18)} Совет тренера</b>${adv.map(a => `<p>${esc(a.text)} <a href="#/library/${esc(a.muscle)}">Упражнения</a></p>`).join("")}<p class="muted tiny" style="margin:0">Считается по записанным и отмеченным тренировкам этого периода, это ориентир.</p></div>` : "";
    app.innerHTML = `<a class="back" href="#/programs">← Тренировки</a><h1>Статистика</h1>${P.ideaChips(["N1"])}
      <div class="seg stat-tabs" role="navigation" aria-label="Период">${tabs}</div>
      <div class="kpis kpis3"><div class="card kpi"><div class="kv">${sum.workouts}</div><div class="kl">Тренировок</div></div><div class="card kpi"><div class="kv">${sum.seconds ? esc(S0.fmtTime(sum.seconds)) : "—"}</div><div class="kl">Время</div></div><div class="card kpi"><div class="kv">${sum.tonnage ? esc(S0.fmtKg(sum.tonnage)) : "—"}</div><div class="kl">Поднято всего</div></div></div>
      ${sum.marks ? `<p class="muted tiny">${sum.marks} из них отмечены без записи подходов: веса и времени у них нет, а нагрузка на мышцы посчитана примерно по программе или по твоей отметке.</p>` : ""}
      <a class="card row-link" href="#/quick"><span class="oi">${ic("check", 22)}</span><div class="rl-tx"><b>Просто отметить мышцы</b><div class="muted">Не записываешь подходы? Нажми, что тренировал: сегодня или за прошлые дни</div></div><span class="chev" aria-hidden="true">›</span></a>
      <a class="card row-link" href="#/log"><span class="oi">${ic("dumbbell", 22)}</span><div class="rl-tx"><b>${st.draft ? "Продолжить тренировку" : "Записать тренировку"}</b><div class="muted">Подходы, повторения и вес</div></div><span class="chev" aria-hidden="true">›</span></a>
      ${advHtml}
      ${empty ? `<div class="card"><p style="margin:0">Пока нет тренировок. Есть три способа, и подходят любые: отметь готовую программу сделанной, нажми «Просто отметить мышцы» или запиши подходы и веса. После этого здесь появятся недели, месяцы и уровни мышц.</p></div>` : `
      <div class="card"><div class="row"><b>Уровни мышц</b><span class="muted tiny">${esc({ week: "за неделю", month: "за месяц", year: "за год", all: "за всё время" }[per])}</span></div>
        <div class="stat-figs">${["front", "back"].map(v => window.Body.svg(v, null, labels, { levels, compact: true, levelNames: names })).join("")}</div>
        <div class="lv-legend">${[4, 3, 2, 1].map(l => `<span class="lv-chip lv-${l}"><i></i>${esc(names[l])}: ${counts[l]}</span>`).join("")}</div>
        <p class="muted tiny" id="mcap" role="status" style="min-height:1.4em">Нажми на мышцу, чтобы увидеть подробности.</p>
        <p class="muted tiny" style="margin-bottom:0">Уровень зависит от числа рабочих подходов на мышцу в неделю: Дерево — до 5, Бронза — 5–9, Серебро — 10–14, Золото — от 15. Это ориентир, а не оценка.${sum.estimated ? " Часть нагрузки посчитана примерно: по отметкам программ и по быстрым отметкам, а не по записанным подходам." : ""}</p></div>
      <div class="card"><b>Вес по неделям</b><p class="muted tiny" style="margin:2px 0 0">тонн за каждые 7 дней, последние 8 недель</p>${window.Charts.bars(weeks.map(w => ({ label: dd(w.from), value: Math.round(w.tonnage / 100) / 10 })), { label: "Поднятый вес по неделям, тонн" })}</div>
      <div class="card"><b>Тренировок по неделям</b>${window.Charts.bars(weeks.map(w => ({ label: dd(w.from), value: w.workouts })), { label: "Тренировок по неделям" })}</div>
      ${keys.length ? `<div class="card"><b>Нагрузка по мышцам</b>${keys.map(m => { const x = sum.byMuscle[m], max = sum.byMuscle[keys[0]].sets; return `<div class="mrow"><span>${esc(label(m))}</span><span class="muted tiny">${x.sets} подх. · ${esc(names[x.level])}</span><div class="bar"><i class="lv-fill lv-${x.level}" style="width:${Math.round(x.sets / max * 100)}%"></i></div></div>`; }).join("")}</div>` : ""}
      <h2>Последние тренировки</h2>
      ${hist.length ? hist.map(s => { const v = S0.volume(s); return `<a class="card row-link" href="#/session/${esc(s.id)}"><span class="oi">${ic("dumbbell", 22)}</span><div class="rl-tx"><b>${esc(s.title)}</b><div class="muted">${esc(dd(s.date))} · ${v.sets} подх. · ${esc(S0.fmtKg(v.tonnage))} · ${esc(S0.fmtTime(s.durationSec))}</div></div><span class="chev" aria-hidden="true">›</span></a>`; }).join("") : '<p class="muted">Записанных тренировок пока нет.</p>'}`}`;
    const cap = document.getElementById("mcap");
    if (cap) app.querySelector(".stat-figs").onkeydown = ev => { if ((ev.key === "Enter" || ev.key === " ") && ev.target.dataset && ev.target.dataset.m) { ev.preventDefault(); ev.target.dispatchEvent(new MouseEvent("click", { bubbles: true })); } };
    if (cap) app.querySelector(".stat-figs").onclick = ev => {
      const z = ev.target.closest ? ev.target.closest("[data-m]") : null; if (!z) return;
      const m = z.dataset.m, x = sum.byMuscle[m];
      app.querySelectorAll(".mz.picked").forEach(e => e.classList.remove("picked"));
      app.querySelectorAll('.mz[data-m="' + m + '"]').forEach(e => e.classList.add("picked"));
      cap.textContent = x ? label(m) + ": " + names[x.level] + ", " + x.sets + " подходов" + (x.est ? " (из них примерно " + x.est + " по отметкам)" : "") + " (" + String(x.perWeek).replace(".", ",") + " в неделю)" : label(m) + ": нагрузки за этот период не было";
    };
  };

  // ---------- быстрая отметка мышц ----------
  P.quick = function (FW) {
    const { app, esc } = FW, st = FW.state, C = window.Catalog;
    const t = S().dayNum(FW.today());
    const days = []; for (let i = 0; i < 7; i++) { const d = S().dayStr(t - i), busy = st.log.some(l => l.date === d); days.push({ d, label: i === 0 ? "Сегодня" : i === 1 ? "Вчера" : dd(d), busy }); }
    const free = days.filter(x => !x.busy);
    let day = (free[0] || {}).d || "", picked = [];
    const chips = () => C.MUSCLES.map(m => `<button type="button" class="ghost ${picked.includes(m.id) ? "on" : ""}" data-m="${m.id}" aria-pressed="${picked.includes(m.id)}">${esc(m.label)}</button>`).join("");
    app.innerHTML = `<a class="back" href="#/stats">← Статистика</a><h1>Что ты тренировал</h1>
      <p class="muted">Не обязательно записывать подходы. Выбери день и мышцы, и статистика посчитает нагрузку примерно (по 4 подхода на мышцу). Веса и времени у такой отметки не будет.</p>
      ${free.length ? `<div class="card"><b>День</b><div class="chips" id="qdays">${free.map(x => `<button type="button" class="ghost ${x.d === day ? "on" : ""}" data-d="${x.d}">${esc(x.label)}</button>`).join("")}</div>
        <b style="display:block;margin-top:12px">Мышцы</b><div class="chips" id="qmus">${chips()}</div>
        <p class="muted tiny" id="qhint" role="status">Выбери хотя бы одну мышцу.</p>
        <button type="button" class="wide" id="qsave" disabled>Отметить тренировку</button></div>`
        : `<div class="card"><p style="margin:0">За последние 7 дней в каждый день уже есть тренировка. Открой нужную в статистике или запиши подходы.</p></div>`}
      <p class="muted tiny">Отметка засчитывается как тренировка дня: баллы и серия, как при отметке программы. Если помнишь подходы, лучше <a href="#/log">запиши их</a>: тогда будут вес и время.</p>`;
    if (!free.length) return;
    const draw = () => {
      document.getElementById("qmus").innerHTML = chips();
      document.querySelectorAll("#qdays [data-d]").forEach(b => b.classList.toggle("on", b.dataset.d === day));
      document.getElementById("qsave").disabled = !picked.length;
      document.getElementById("qhint").textContent = picked.length ? "Выбрано мышц: " + picked.length : "Выбери хотя бы одну мышцу.";
    };
    document.getElementById("qmus").onclick = ev => { const b = ev.target.closest("[data-m]"); if (!b) return; const m = b.dataset.m; picked = picked.includes(m) ? picked.filter(x => x !== m) : picked.concat(m); draw(); };
    document.getElementById("qdays").onclick = ev => { const b = ev.target.closest("[data-d]"); if (!b) return; day = b.dataset.d; draw(); };
    document.getElementById("qsave").onclick = () => {
      const e = FW.quickMark(day, picked);
      if (!e) return;
      if (window.FX && window.FX.toast) window.FX.toast("Тренировка отмечена", "check");
      location.hash = "#/stats";
    };
  };
  // Для пошагового режима (pages-go.js): те же черновик, подсказки и подсчёт, что в обычной записи.
  P._log = { goalLine, newSet, startDay, hasData, parsed, blankDraft, lastSets, label };
})();
