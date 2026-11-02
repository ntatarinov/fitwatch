// Пошаговая тренировка: разминка, потом по одному упражнению на экране (рабочая мышца подсвечена на теле), отметка подхода одним нажатием,
// таймер отдыха, в конце итог и вопрос «насколько тяжело». Работает поверх того же черновика, что и обычная запись (pages-stats.js),
// поэтому сохраняется в ту же статистику и уходит тренеру так же. Здесь же страница заданий от тренера.
(function () {
  "use strict";
  const P = (window.PAGES = window.PAGES || {});
  const C = () => window.Catalog, S = () => window.Stats, ic = (n, s) => window.Icons.svg(n, s);
  const num = v => Number(String(v).replace(",", "."));
  const REST = 75;               // секунд отдыха между подходами по умолчанию
  const WARM = ["cat_cow", "leg_swings", "glute_bridge"];

  let tick = null;
  const stop = () => { if (tick) { clearInterval(tick); tick = null; } };
  const prevCleanup = P._cleanup;
  P._cleanup = () => { stop(); if (prevCleanup) prevCleanup(); };
  // Отдых живёт только на экране: ушёл со страницы — таймера нет. Конец отдыха хранится как момент времени.
  let rest = null;

  const hintParts = s => { const h = String(s.hint || "").split("×"); return { reps: h[0] || "", kg: h[1] || "" }; };

  P.go = async function (FW, a, b) {
    const { app, esc } = FW, st = FW.state, H = P._log, nav = FW.nav();
    stop();

    // Задание от тренера: берём его с сервера и превращаем в черновик.
    if (a === "assigned") {
      if (window.Account.state.status !== "user") { location.replace("#/assigned"); return; }
      const r = await window.Account.assignments();
      if (FW.stale(nav)) return;
      const t = r.ok && r.data.items.find(x => String(x.id) === String(b) && x.status === "new");
      if (!t) return FW.notFound();
      if (H.hasData(st.draft)) { app.innerHTML = `<a class="back" href="#/assigned">← Задания</a><h1>Есть начатая тренировка</h1><div class="card"><p>Сначала завершите или отмените идущую тренировку «${esc(st.draft.title)}».</p><a class="btn" href="#/go">Продолжить её</a></div>`; return; }
      const d = H.blankDraft(FW);
      d.title = String(t.title).slice(0, 80); d.src = { p: "trainer", d: String(t.id) }; d.note = t.note || "";
      d.items = t.items.map(i => ({ ex: String(i.ex).slice(0, 24), name: String(i.name).slice(0, 60), sets: Array.from({ length: Math.min(10, i.sets || 3) }, (_, n) => H.newSet(FW, i.ex, n, parseInt(i.reps, 10) ? String(parseInt(i.reps, 10)) : "")) }));
      st.draft = d; FW.save(); location.replace("#/go"); return;
    }
    // Из дня программы или плана: та же подготовка, что у обычной записи.
    if (a && b) {
      const same = st.draft && st.draft.src && st.draft.src.p === a && st.draft.src.d === b;
      if (!same) {
        if (H.hasData(st.draft)) { location.replace("#/log/" + a + "/" + b); return; }
        const d = H.startDay(FW, { p: a, d: b });
        if (!d) return FW.notFound();
        st.draft = d; FW.save();
      }
      location.replace("#/go"); return;
    }
    const d = st.draft;
    if (!d || !d.items.length) { location.replace("#/log"); return; }

    const n = d.items.length, save = () => FW.save();
    let step = Number.isInteger(d.step) ? d.step : d.warm ? 0 : -1;
    step = Math.max(-1, Math.min(n, step));
    const setStep = v => { d.step = Math.max(-1, Math.min(n, v)); rest = null; save(); P.go(FW); window.scrollTo(0, 0); };
    const labels = Object.fromEntries(C().MUSCLES.map(m => [m.id, m.label]));
    const clock = () => S().fmtClock((Date.now() - d.startedAt) / 1000);
    const pct = Math.round((Math.max(0, step) / n) * 100);
    const head = `<a class="back" href="#/log">← Весь список</a>
      <div class="go-top"><div class="go-prog" role="progressbar" aria-valuemin="0" aria-valuemax="${n}" aria-valuenow="${Math.max(0, step)}" aria-label="Прогресс тренировки"><i style="width:${pct}%"></i></div><span class="lg-clock" id="gclock" role="timer">${clock()}</span></div>
      ${d.note ? `<div class="card"><span class="muted tiny">Заметка тренера</span><p style="margin:4px 0 0">${esc(d.note)}</p></div>` : ""}`;
    const keepClock = () => { const el = document.getElementById("gclock"); if (el) tick = setInterval(() => { if (!el.isConnected) { stop(); return; } el.textContent = clock(); tickRest(); }, 1000); };

    // ---- разминка ----
    if (step === -1) {
      const items = WARM.map(id => C().byId(id)).filter(Boolean);
      app.innerHTML = head + `<h1>Разминка, 5 минут</h1>
        <p class="muted">Холодные мышцы и суставы травмируются чаще. Пройди три движения и сделай 1–2 лёгких подхода первого упражнения с малым весом.</p>
        ${items.map(e => `<a class="card row-link" href="#/x/${esc(e.id)}"><span class="oi">${ic("activity", 22)}</span><div class="rl-tx"><b>${esc(e.title)}</b><div class="muted">${esc(e.dose || e.summary || "")}</div></div><span class="chev" aria-hidden="true">›</span></a>`).join("")}
        <div class="cl-act wrap"><button type="button" id="gwarm">Разминка сделана</button><button type="button" class="ghost" id="gskipwarm">Пропустить</button></div>`;
      document.getElementById("gwarm").onclick = () => { d.warm = true; setStep(0); };
      document.getElementById("gskipwarm").onclick = () => { d.warm = true; setStep(0); };
      keepClock(); return;
    }

    // ---- итог ----
    if (step >= n) {
      const v = S().volume(H.parsed(d)), min = Math.max(1, Math.min(600, Math.round((Date.now() - d.startedAt) / 60000)));
      app.innerHTML = head + `<h1>Готово</h1>
        <div class="kpis kpis3"><div class="card kpi"><div class="kv">${v.sets}</div><div class="kl">Подходов</div></div><div class="card kpi"><div class="kv">${esc(S().fmtKg(v.tonnage))}</div><div class="kl">Поднято</div></div><div class="card kpi"><div class="kv">${min} мин</div><div class="kl">По таймеру</div></div></div>
        <div class="card"><label for="gmin" class="muted">Сколько минут заняла тренировка?</label><input id="gmin" type="number" inputmode="numeric" min="1" max="600" value="${min}" style="width:120px">
          <div class="rpe"><span class="muted">Насколько тяжело было?</span><div class="chips" id="grpe" role="group" aria-label="Тяжесть тренировки">${[[4, "Легко"], [7, "Нормально"], [9, "Тяжело"], [10, "На пределе"]].map(([x, l]) => `<button type="button" class="ghost" data-rpe="${x}" aria-pressed="false">${l}</button>`).join("")}</div><p class="muted tiny">Нужно для цели на следующий раз. Можно пропустить.</p></div>
          <div class="status" id="gerr" role="alert"></div><div class="cl-act wrap"><button type="button" id="gsave">Сохранить тренировку</button><button type="button" class="ghost" id="gback">Назад</button></div></div>`;
      let rpe = null;
      document.getElementById("grpe").onclick = ev => { const x = ev.target.closest && ev.target.closest("[data-rpe]"); if (!x) return; rpe = rpe === Number(x.dataset.rpe) ? null : Number(x.dataset.rpe); document.querySelectorAll("#grpe [data-rpe]").forEach(y => { const on = Number(y.dataset.rpe) === rpe; y.classList.toggle("on", on); y.setAttribute("aria-pressed", String(on)); }); };
      document.getElementById("gback").onclick = () => setStep(n - 1);
      document.getElementById("gsave").onclick = () => {
        const m = Math.round(num(document.getElementById("gmin").value));
        if (!(m >= 1 && m <= 600)) { document.getElementById("gerr").textContent = "Минуты: от 1 до 600."; return; }
        const s = FW.finishSession(d, m, rpe);
        if (!s) { document.getElementById("gerr").textContent = "Отметь хотя бы один подход с повторениями."; return; }
        if (d.src && d.src.p === "trainer" && window.Account.assignmentDone) window.Account.assignmentDone(d.src.d, s.id);
        FW.go("#/session/" + s.id + "/new");
      };
      keepClock(); return;
    }

    // ---- упражнение ----
    const it = d.items[step], e = C().byId(it.ex), muscle = e && e.muscles[0];
    const view = muscle && window.Body.musclesIn("front").includes(muscle) ? "front" : "back";
    const feel = muscle && C().FEEL[muscle];
    const cur = it.sets.findIndex(s => !s.done), allDone = cur === -1;
    const nextName = step + 1 < n ? d.items[step + 1].name : "";
    const row = (s, si) => `<div class="lg-set go-set ${s.done ? "done" : si === cur ? "cur" : ""}"><span class="lg-n">${s.done ? ic("check", 16) : si + 1}</span>
      <input inputmode="numeric" pattern="[0-9]*" maxlength="4" data-s="${si}" data-f="reps" value="${esc(s.reps)}" placeholder="${esc(hintParts(s).reps || "—")}" aria-label="Повторы, подход ${si + 1}">
      <input inputmode="decimal" maxlength="6" data-s="${si}" data-f="kg" value="${esc(s.kg)}" placeholder="${esc(hintParts(s).kg || "0")}" aria-label="Вес в кг, подход ${si + 1}">
      <span></span></div>`;
    app.innerHTML = head + `<p class="muted tiny" style="margin:6px 0 0">Упражнение ${step + 1} из ${n}</p>
      <div class="go-ex"><div class="go-fig" aria-hidden="true">${muscle ? window.Body.svg(view, muscle, labels, { compact: true }) : ""}</div>
        <div><h1 style="margin-top:0">${esc(it.name)}</h1><div class="muted">${esc(((e && e.muscles) || []).map(m => labels[m]).join(", "))}</div>${H.goalLine(FW, it.ex)}
          <p style="margin:8px 0 0">${e ? `<a href="#/x/${esc(e.id)}">Как выполнять${e.video ? ", видео" : ""}</a>` : ""}</p></div></div>
      ${feel ? `<details class="card"><summary><b>Где почувствуешь: ${esc(labels[muscle].toLowerCase())}</b></summary><p style="margin:8px 0 0">${esc(feel.feel)}</p></details>` : ""}
      <div class="card"><div class="lg-head"><span>№</span><span>Повторы</span><span>Вес, кг</span><span></span></div><div id="gsets">${it.sets.map(row).join("")}</div>
        <div id="grest"></div><div class="status" id="gerr" role="alert"></div>
        <div class="cl-act wrap">${allDone ? `<button type="button" id="gnext">${nextName ? "Дальше: " + esc(nextName) : "К итогу"}</button>` : `<button type="button" id="gdone">Подход ${cur + 1} сделан</button>`}
          <button type="button" class="ghost" id="gadd">+ Подход</button><button type="button" class="ghost" id="gskip">Пропустить упражнение</button></div></div>
      <p class="center">${step > 0 ? `<button type="button" class="ghost tiny-btn" id="gprev">← Предыдущее</button>` : ""}</p>`;

    document.getElementById("gsets").oninput = ev => {
      const t = ev.target; if (!t.dataset || !t.dataset.f) return;
      let v = t.value.replace(/[^0-9.,]/g, "");
      if (t.dataset.f === "reps") v = v.replace(/[.,].*/, ""); else v = v.replace(/([.,]).*?[.,].*/, "$1").replace(/^([0-9]*[.,][0-9]).*$/, "$1");
      if (v !== t.value) t.value = v;
      it.sets[+t.dataset.s][t.dataset.f] = v; save();
    };
    const done = document.getElementById("gdone");
    if (done) done.onclick = () => {
      const s = it.sets[cur], h = hintParts(s);
      // Одно нажатие: если поля пустые, берём подсказку (прошлый раз или план).
      if (!String(s.reps).trim() && h.reps) s.reps = h.reps;
      if (!String(s.kg).trim() && h.kg) s.kg = h.kg;
      if (!(num(s.reps) > 0)) { document.getElementById("gerr").textContent = "Впиши, сколько повторений ты сделал."; return; }
      s.done = true;
      const last = it.sets.every(x => x.done);
      rest = last ? null : { until: Date.now() + REST * 1000 };
      // Следующий подход начинается с тех же значений, что и этот.
      const nx = it.sets.find(x => !x.done); if (nx && !nx.hint) nx.hint = s.reps + "×" + s.kg;
      save(); P.go(FW);
    };
    const nextBtn = document.getElementById("gnext"); if (nextBtn) nextBtn.onclick = () => setStep(step + 1);
    document.getElementById("gadd").onclick = () => { const prev = it.sets[it.sets.length - 1]; if (it.sets.length < 30) it.sets.push({ reps: "", kg: "", hint: prev && (prev.reps || prev.kg) ? (prev.reps || "") + "×" + (prev.kg || "") : "", done: false }); save(); P.go(FW); };
    document.getElementById("gskip").onclick = () => setStep(step + 1);
    const prev = document.getElementById("gprev"); if (prev) prev.onclick = () => setStep(step - 1);
    drawRest(); keepClock();
  };

  // Таймер отдыха: показывается под подходами, пока не вышел срок или не нажали «Пропустить».
  function drawRest() {
    const box = document.getElementById("grest"); if (!box) return;
    if (!rest || rest.until <= Date.now()) { rest = null; box.innerHTML = ""; return; }
    const left = Math.max(0, Math.round((rest.until - Date.now()) / 1000));
    if (!box.firstChild) {
      box.innerHTML = `<div class="go-rest" role="timer" aria-live="off"><span>Отдых</span><b id="grtime"></b><button type="button" class="ghost tiny-btn" id="gplus">+15 с</button><button type="button" class="ghost tiny-btn" id="gnorest">Пропустить</button></div>`;
      document.getElementById("gplus").onclick = () => { if (rest) { rest.until += 15000; tickRest(); } };
      document.getElementById("gnorest").onclick = () => { rest = null; drawRest(); };
    }
    document.getElementById("grtime").textContent = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
  }
  function tickRest() {
    const box = document.getElementById("grest"); if (!box) return;
    if (rest && rest.until <= Date.now()) { rest = null; box.innerHTML = ""; try { window.FX && window.FX.toast && window.FX.toast("Отдых закончен, следующий подход", "bolt"); } catch (e) { /* звук и подсказка необязательны */ } return; }
    drawRest();
  }

  // ---------- задания от тренера ----------
  P.assigned = async function (FW) {
    const { app, esc } = FW, nav = FW.nav();
    if (window.Account.state.status !== "user") { app.innerHTML = `<a class="back" href="#/programs">← Тренировки</a><h1>Задания от тренера</h1><div class="card"><p>Чтобы получать задания, войди в аккаунт и выбери тренера.</p><a class="btn" href="#/account">Войти</a></div>`; return; }
    app.innerHTML = `<a class="back" href="#/programs">← Тренировки</a><h1>Задания от тренера</h1><p class="muted">Загружаю…</p>`;
    const r = await window.Account.assignments();
    if (FW.stale(nav)) return;
    if (!r.ok) { app.innerHTML = `<a class="back" href="#/programs">← Тренировки</a><h1>Задания от тренера</h1><div class="card"><p class="muted">${esc((r.data && r.data.error) || r.error || "Не удалось загрузить")}</p></div>`; return; }
    const list = r.data.items;
    app.innerHTML = `<a class="back" href="#/programs">← Тренировки</a><h1>Задания от тренера</h1>
      ${list.length ? list.map(t => `<div class="card asg ${t.status}"><div class="row"><b>${esc(t.title)}</b><span class="pill">${t.status === "done" ? "Выполнено" : "Новое"}</span></div>
        <div class="muted tiny">${esc(t.trainer || "Тренер")}</div>${t.note ? `<p style="margin:6px 0">${esc(t.note)}</p>` : ""}
        <ul class="asg-items">${t.items.map(i => `<li>${esc(i.name)}: ${i.sets} × ${esc(i.reps)}</li>`).join("")}</ul>
        ${t.status === "new" ? `<a class="btn" href="#/go/assigned/${t.id}">Начать по шагам</a>` : ""}</div>`).join("") : `<div class="card"><p class="muted" style="margin:0">Пока заданий нет. Когда тренер назначит тренировку, она появится здесь и на главной.</p></div>`}`;
  };
})();
