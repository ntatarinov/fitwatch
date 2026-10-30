(function () {
  "use strict";
  const KEY = "fitwatch.v1";
  const app = document.getElementById("app");
  const badge = document.getElementById("badge");
  const PROGRAMS = window.PROGRAMS;
  const Engine = window.Engine;
  const Tree = window.Tree;

  // ---------- состояние профиля (localStorage) ----------
  // done/watched — просмотр видео; log — отметки «Я потренировался» [{date,p,d,points}];
  // checkins — ежедневный отзыв [{date,energy,mood,barrier,liked,disliked,idea}];
  // food — дневник питания [{date,name,kcal}]
  const fresh = () => ({ name: "Гость", done: {}, watched: {}, log: [], checkins: [], food: [], kcalGoal: window.KCAL_DEFAULT });
  function load() {
    try { return Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY))); }
    catch (e) { return fresh(); }
  }
  let state = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} renderBadge(); }
  const k = (p, e) => p + "/" + e;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const exOf = (p, id) => p.exercises.find(e => e.id === id);
  const dayPoints = d => (d.points != null ? d.points : window.DAY_POINTS);
  const labelOf = (list, id) => (list.find(x => x.id === id) || { label: id }).label;

  function allExercises() { return PROGRAMS.flatMap(p => p.exercises.map(e => ({ p, e }))); }

  // ---------- даты, серия, баллы ----------
  const pad = n => String(n).padStart(2, "0");
  const dateStr = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const today = () => dateStr(new Date());
  const dayNum = s => { const [y, m, d] = s.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
  const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return dateStr(d); };

  function workoutDates() { return [...new Set(state.log.map(l => l.date))].sort(); }

  // Серия: тренировки подряд с перерывом не больше STREAK_MAX_GAP дней; позже — серия сгорела.
  function streak() {
    const dates = workoutDates();
    if (!dates.length) return 0;
    if (dayNum(today()) - dayNum(dates[dates.length - 1]) > window.STREAK_MAX_GAP) return 0;
    let n = 1;
    for (let i = dates.length - 1; i > 0; i--) {
      if (dayNum(dates[i]) - dayNum(dates[i - 1]) <= window.STREAK_MAX_GAP) n++; else break;
    }
    return n;
  }
  function weekCount() {
    const now = dayNum(today());
    return workoutDates().filter(d => now - dayNum(d) < 7).length;
  }
  function totalPoints() {
    const watch = allExercises().reduce((s, { p, e }) => s + (state.done[k(p.id, e.id)] ? e.points : 0), 0);
    return watch + state.log.reduce((s, l) => s + l.points, 0);
  }
  const trainedToday = () => state.log.some(l => l.date === today());
  const todayCheckin = () => state.checkins.find(c => c.date === today()) || null;
  function renderBadge() { badge.textContent = "⭐ " + totalPoints() + " · " + state.name; }

  function profileNow() {
    return Engine.computeProfile({
      checkins: state.checkins,
      workoutDayNums: workoutDates().map(dayNum),
      todayNum: dayNum(today()),
    });
  }
  function adviceNow() {
    const dates = workoutDates();
    return Engine.advice({
      profile: profileNow(),
      today: todayCheckin(),
      daysSinceWorkout: dates.length ? dayNum(today()) - dayNum(dates[dates.length - 1]) : null,
      trainedToday: trainedToday(),
      maxGap: window.STREAK_MAX_GAP,
    });
  }
  // Первый ещё не пройденный день основных программ (или первый день).
  function nextDayHref() {
    for (const p of PROGRAMS.filter(x => x.id !== "stretch")) {
      for (const d of p.days) if (!state.log.some(l => l.p === p.id && l.d === d.id)) return `#/d/${p.id}/${d.id}`;
    }
    return "#/d/start/d1";
  }

  // ---------- действия (без работы со страницей — их можно проверять тестом) ----------
  function saveCheckin(v) {
    const rec = {
      date: today(),
      energy: clamp(v.energy), mood: clamp(v.mood),
      barrier: window.BARRIERS.some(b => b.id === v.barrier) ? v.barrier : "none",
      liked: String(v.liked || "").slice(0, 500), disliked: String(v.disliked || "").slice(0, 500), idea: String(v.idea || "").slice(0, 500),
    };
    const i = state.checkins.findIndex(c => c.date === rec.date);
    if (i >= 0) state.checkins[i] = rec; else state.checkins.push(rec);
    save();
  }
  const clamp = n => Math.min(5, Math.max(1, Math.round(Number(n)) || 3));

  function addFood(name, kcal) {
    const n = String(name).trim().slice(0, 60), c = Math.round(Number(kcal));
    if (!n || !(c > 0) || c > 5000) return false;
    state.food.push({ date: today(), name: n, kcal: c });
    save();
    return true;
  }
  const foodToday = () => state.food.map((f, i) => ({ f, i })).filter(x => x.f.date === today());

  function logWorkout(p, d) {
    if (trainedToday()) return false;
    state.log.push({ date: today(), p: p.id, d: d.id, points: dayPoints(d) });
    save();
    return true;
  }

  // Демо-данные: две недели жизни «спринтера», чтобы сразу показать профиль заказчику.
  function loadDemo() {
    const energy = [5, 4, 2, 2, 1, 2, 4, 5, 4, 2, 1, 3, 4];
    const barrier = ["none", "none", "tired", "time", "mood", "tired", "none", "none", "time", "tired", "boring", "none", "none"];
    const notes = {
      0: ["Видео про приседания — понятно", "", ""],
      4: ["", "Тяжело вставать утром, пропустил три дня", "Напоминание, которое не ругает"],
      8: ["Серия мотивирует", "Хочется короче", "Тренировка на 10 минут"],
    };
    const s = fresh();
    s.name = "Демо";
    for (let i = 0; i < 13; i++) {
      const n = notes[i] || ["", "", ""];
      s.checkins.push({ date: daysAgo(13 - i), energy: energy[i], mood: Math.max(1, Math.min(5, energy[i] + (i % 2 ? -1 : 0))), barrier: barrier[i], liked: n[0], disliked: n[1], idea: n[2] });
    }
    [[13, "start", "d1"], [12, "start", "d2"], [8, "start", "d3"], [7, "stretch", "d1"], [3, "start", "d1"], [2, "errors", "d1"]].forEach(([off, p, d]) => {
      const prog = PROGRAMS.find(x => x.id === p), day = prog.days.find(x => x.id === d);
      s.log.push({ date: daysAgo(off), p, d, points: dayPoints(day) });
    });
    s.done = { "start/squat": true, "start/pushup": true };
    s.food = [
      { date: today(), name: "Овсянка на воде (порция)", kcal: 150 },
      { date: today(), name: "Банан", kcal: 100 },
      { date: today(), name: "Куриная грудка (150 г)", kcal: 165 },
    ];
    state = s;
    save();
  }

  // ---------- отчёт для выгрузки ----------
  function buildReport() {
    const pr = profileNow(), lines = [];
    lines.push(`# Отчёт FitWatch — ${state.name}, ${today()}`);
    lines.push("", "_Принеси этот файл в чат с Claude: разобрать свободные тексты, найти повторяющиеся жалобы и предложить, что изменить в приложении._", "");
    lines.push(`Баллы: ${totalPoints()} · Серия: ${streak()} · Тренировок за 7 дней: ${weekCount()} · Тренировок всего: ${state.log.length}`, "");
    lines.push("## Профиль (по правилам движка, приблизительно)");
    if (pr.ready) {
      lines.push(`Тип: ${pr.title}. ${pr.summary}`,
        `Средняя энергия ${pr.avgEnergy.toFixed(1)}/5, настроение ${pr.avgMood.toFixed(1)}/5, разброс энергии ${pr.stdEnergy.toFixed(1)}, самая долгая пауза ${pr.maxGap} дн.`,
        `Главное препятствие: ${pr.barrier ? pr.barrier.label + " (" + pr.barrier.count + " раз)" : "не выявлено"}.`,
        "Что поможет: " + pr.helps.join("; ") + ".");
    } else {
      lines.push(`Недостаточно данных: нужно ещё ${pr.need} отзыв(а).`);
    }
    lines.push("", "## Отзывы по дням");
    state.checkins.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).forEach(c => {
      lines.push(`- ${c.date} · энергия ${c.energy}, настроение ${c.mood}, мешает: ${labelOf(window.BARRIERS, c.barrier)}` +
        (c.liked ? ` · понравилось: ${c.liked}` : "") + (c.disliked ? ` · не понравилось: ${c.disliked}` : "") + (c.idea ? ` · идея: ${c.idea}` : ""));
    });
    if (!state.checkins.length) lines.push("- отзывов нет");
    lines.push("", "## Тренировки");
    state.log.forEach(l => lines.push(`- ${l.date} · ${l.p}/${l.d} · +${l.points}`));
    if (!state.log.length) lines.push("- тренировок нет");
    lines.push("", "## Питание сегодня");
    const ft = foodToday();
    ft.forEach(({ f }) => lines.push(`- ${f.name} · ${f.kcal} ккал`));
    lines.push(`Итого: ${ft.reduce((s, x) => s + x.f.kcal, 0)} из ${state.kcalGoal} ккал`);
    return lines.join("\n");
  }

  // ---------- общие куски страниц ----------
  function statsHtml() {
    return `<div class="stats">
      <div class="card stat"><div class="big">${streak()}</div><div class="muted">тренировок в серии</div></div>
      <div class="card stat"><div class="big">${weekCount()}</div><div class="muted">за 7 дней</div></div>
    </div>`;
  }

  function adviceHtml() {
    const a = adviceNow();
    const act = {
      checkin: ["#/checkin", "Заполнить отзыв"],
      light: ["#/d/stretch/d1", "Растяжка на 10 минут"],
      return: ["#/d/stretch/d1", "Минимум: 10 минут"],
      start: ["#/d/start/d1", "К первому дню"],
      go: [nextDayHref(), "К тренировке"],
    }[a.kind];
    return `<div class="hero ${a.kind}"><h2>${esc(a.title)}</h2><p>${esc(a.text)}</p>${act ? `<a class="btn" href="${act[0]}">${act[1]}</a>` : ""}</div>`;
  }

  function profileCardHtml() {
    const pr = profileNow();
    if (!pr.ready) {
      return `<div class="card"><b>Профиль</b><p class="muted">Ещё ${pr.need} ${pr.need === 1 ? "отзыв" : "отзыва"} — и я покажу, что тебя мотивирует и где ты сбиваешься. Сейчас отзывов: ${pr.n}.</p><a class="btn" href="#/checkin">Заполнить отзыв</a></div>`;
    }
    return `<div class="card"><div class="muted">Твой профиль</div><div class="big small">${esc(pr.title)}</div><p>${esc(pr.summary)}</p>
      <p class="muted">Энергия ${pr.avgEnergy.toFixed(1)}/5 · настроение ${pr.avgMood.toFixed(1)}/5 · главное препятствие: ${pr.barrier ? esc(pr.barrier.label) : "не выявлено"}</p>
      <b>Что поможет</b><ul>${pr.helps.map(h => `<li>${esc(h)}</li>`).join("")}</ul>
      <p class="muted">Это приблизительная оценка по твоим отзывам за последние 2 недели, а не психологический диагноз.</p></div>`;
  }

  // ---------- страницы ----------
  const doneDays = p => p.days.filter(d => state.log.some(l => l.p === p.id && l.d === d.id)).length;

  function home() {
    app.innerHTML = "<h1>Привет, " + esc(state.name) + "</h1>" +
      adviceHtml() + statsHtml() + "<h2>Программы</h2><div class='tiles'>" +
      PROGRAMS.map(p => `<a class="tile t-${p.id}" href="#/p/${p.id}"><span class="ic">${p.icon || "🏋️"}</span><b>${esc(p.title)}</b><small>${doneDays(p)}/${p.days.length} дн.</small></a>`).join("") +
      "</div>";
  }

  function programs() {
    app.innerHTML = "<h1>Тренировки</h1>" + PROGRAMS.map(p =>
      `<a class="card" href="#/p/${p.id}"><div class="row"><div><b>${p.icon || ""} ${esc(p.title)}</b><div class="muted">${esc(p.description)}</div></div>
        <span class="pill ${doneDays(p) === p.days.length ? "done" : ""}">${doneDays(p)}/${p.days.length} дн.</span></div></a>`).join("");
  }

  // --- тренер: чат по правилам, без ИИ ---
  // Состояние пользователя для дерева: имя, тип профиля, энергия сегодня, число тренировок.
  function trainerCtx() {
    const pr = profileNow(), ck = todayCheckin();
    return { name: state.name, type: pr.ready ? pr.type : null, energy: ck ? ck.energy : null, workouts: state.log.length };
  }
  let trainerPath = []; // путь по дереву живёт, пока открыта страница
  function trainer() {
    const ctx = trainerCtx(), tree = window.TRAINER_TREE;
    if (!Tree.view(tree, trainerPath, ctx)) trainerPath = []; // защита от битого пути
    const v = Tree.view(tree, trainerPath, ctx);
    const msgs = Tree.transcript(tree, trainerPath, ctx);
    let tail = "";
    if (v.leaf) {
      const pr = profileNow(), note = pr.ready ? window.TYPE_NOTE[pr.type] : "";
      const href = v.action.href === "@next" ? nextDayHref() : v.action.href;
      tail = `<div class="card result"><b>${esc(v.title)}</b><p>${esc(v.text)}</p>
        <ul>${v.tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul>${note ? `<p class="muted">${esc(note)}</p>` : ""}
        <a class="btn" href="${href}">${esc(v.action.label)}</a></div>`;
    } else {
      msgs.push({ me: false, text: v.ask });
      tail = `<div class="chips">${v.options.map(o => `<button class="ghost" data-o="${esc(o.id)}">${esc(o.label)}</button>`).join("")}</div>`;
    }
    app.innerHTML = `<h1>Тренер <span class="tag">по правилам, без ИИ</span></h1>
      <div class="chat">${msgs.map(m => `<div class="msg ${m.me ? "me" : ""}">${esc(m.text)}</div>`).join("")}</div>${tail}
      <div class="row" style="margin-top:12px">
        ${trainerPath.length ? `<button class="ghost" id="tback">↩ Назад</button>` : "<span></span>"}
        ${trainerPath.length ? `<button class="ghost" id="trestart">Начать заново</button>` : ""}
      </div>`;
    app.querySelectorAll("[data-o]").forEach(b => b.onclick = () => {
      const np = Tree.choose(tree, trainerPath, b.dataset.o, ctx);
      if (np) { trainerPath = np; trainer(); window.scrollTo(0, document.body.scrollHeight); }
    });
    const bk = document.getElementById("tback"), rs = document.getElementById("trestart");
    if (bk) bk.onclick = () => { trainerPath = Tree.back(trainerPath); trainer(); };
    if (rs) rs.onclick = () => { trainerPath = []; trainer(); };
  }

  function program(pid) {
    const p = PROGRAMS.find(x => x.id === pid);
    if (!p) return notFound();
    const days = p.days.map(d => {
      const times = state.log.filter(l => l.p === p.id && l.d === d.id).length;
      return `<a class="card" href="#/d/${p.id}/${d.id}"><div class="row"><div><b>${esc(d.title)}</b>
        <div class="muted">${d.items.map(i => esc(exOf(p, i.ex).title)).join(" · ")}</div></div>
        <span class="pill ${times ? "done" : ""}">${times ? "✓ ×" + times : "+" + dayPoints(d)}</span></div></a>`;
    }).join("");
    const exs = p.exercises.map(e => {
      const done = state.done[k(p.id, e.id)];
      return `<a class="card" href="#/e/${p.id}/${e.id}"><div class="row"><div><b>${esc(e.title)}</b><div class="muted">${esc(e.summary)}</div></div>
        <span class="pill ${done ? "done" : ""}">${done ? "✓ просмотрено" : "видео +" + e.points}</span></div></a>`;
    }).join("");
    app.innerHTML = `<a class="back" href="#/">← Все программы</a><h1>${esc(p.title)}</h1><p class="muted">${esc(p.description)}</p>
      <h2>План</h2>${days}<h2>Видео и разбор техники</h2>${exs}`;
  }

  function day(pid, did, justDone) {
    const p = PROGRAMS.find(x => x.id === pid);
    const d = p && p.days.find(x => x.id === did);
    if (!d) return notFound();
    const items = d.items.map((i, n) => {
      const e = exOf(p, i.ex);
      const watched = state.done[k(p.id, e.id)];
      return `<div class="card"><div class="row"><div><b>${n + 1}. ${esc(e.title)}</b>
        <div>${i.sets} × ${esc(i.reps)}${i.rest ? " · отдых " + i.rest + " сек" : ""}</div></div>
        <a class="pill ${watched ? "done" : ""}" href="#/e/${p.id}/${e.id}">${watched ? "✓ видео" : "▶ видео"}</a></div></div>`;
    }).join("");
    app.innerHTML = `<a class="back" href="#/p/${p.id}">← ${esc(p.title)}</a><h1>${esc(d.title)}</h1>
      <p class="muted">Разомнитесь 3–5 минут, затем выполните план. Если не знаете технику — сначала откройте видео.</p>
      ${items}
      <div id="checkin"></div>`;
    renderCheckin(p, d, justDone);
  }

  function renderCheckin(p, d, justDone) {
    const box = document.getElementById("checkin");
    const pts = dayPoints(d);
    if (justDone) {
      box.innerHTML = `<div class="status ok">🎉 Тренировка засчитана! +${pts} баллов. Серия: ${streak()}. Следующая — завтра или через день: отдых тоже часть программы.</div>`;
      return;
    }
    if (trainedToday()) {
      box.innerHTML = `<div class="status ok">✓ Сегодняшняя тренировка уже засчитана. Следующая — завтра или через день: отдых тоже часть программы.</div>`;
      return;
    }
    box.innerHTML = `<button id="done" class="wide">Я потренировался (+${pts})</button>
      <p class="muted">Отмечайте честно: за один календарный день засчитывается одна тренировка.</p>`;
    document.getElementById("done").onclick = () => { if (logWorkout(p, d)) day(p.id, d.id, true); };
  }

  let player = null, timer = null;
  function stopPlayer() {
    if (timer) clearInterval(timer);
    timer = null;
    if (player && player.destroy) { try { player.destroy(); } catch (e) {} }
    player = null;
  }

  function exercise(pid, eid) {
    const p = PROGRAMS.find(x => x.id === pid);
    const e = p && exOf(p, eid);
    if (!e) return notFound();
    const key = k(pid, eid);
    app.innerHTML = `<a class="back" href="#/p/${p.id}">← ${esc(p.title)}</a><h1>${esc(e.title)}</h1><p class="muted">${esc(e.summary)}</p>
      <div class="video"><div id="yt"></div></div>
      <div class="bar"><i id="bar"></i></div>
      <div class="status" id="status"></div>
      <div class="card"><b>Как выполнять</b><ol>${e.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
        <p><b>Частые ошибки:</b> ${esc(e.mistakes)}</p><p><b>Дозировка:</b> ${esc(e.dose)}</p></div>`;
    const bar = document.getElementById("bar"), status = document.getElementById("status");
    let duration = 0;

    function paint() {
      const need = duration ? duration * window.WATCH_THRESHOLD : 0;
      const w = state.watched[key] || 0;
      bar.style.width = (state.done[key] ? 100 : need ? Math.min(100, w / need * 100) : 0) + "%";
      if (state.done[key]) { status.textContent = "✓ Техника изучена, +" + e.points + " баллов в профиле"; status.className = "status ok"; }
      else { status.textContent = "Посмотрите видео — небольшие баллы начислятся автоматически (+" + e.points + "). Основные баллы — за тренировку."; status.className = "status"; }
    }
    paint();

    function tick() {
      if (!player || player.getPlayerState() !== 1) return; // 1 = идёт воспроизведение
      duration = player.getDuration();
      if (state.done[key] || !duration) return;
      state.watched[key] = (state.watched[key] || 0) + 1;
      if (state.watched[key] >= duration * window.WATCH_THRESHOLD) state.done[key] = true;
      save(); paint();
    }

    withYouTube(() => {
      if (!document.getElementById("yt")) return;
      player = new YT.Player("yt", {
        videoId: e.video,
        playerVars: { rel: 0, playsinline: 1 },
        events: { onReady: () => { duration = player.getDuration(); paint(); } },
      });
      timer = setInterval(tick, 1000);
    });
  }

  // --- ежедневный отзыв ---
  function scale(name, labels, val) {
    return `<div class="chips">` + labels.map((l, i) =>
      `<label class="chip"><input type="radio" name="${name}" value="${i + 1}" ${i + 1 === val ? "checked" : ""}><span>${i + 1}<small>${esc(l)}</small></span></label>`).join("") + `</div>`;
  }
  function checkin(saved) {
    const c = todayCheckin() || { energy: 3, mood: 3, barrier: "none", liked: "", disliked: "", idea: "" };
    app.innerHTML = `<h1>Отзыв за сегодня</h1><p class="muted">Минута. От ответов зависят советы и профиль. Всё хранится только на этом устройстве.</p>
      ${saved ? adviceHtml() : ""}
      <form id="ci" class="card">
        <label><b>Сколько сил сегодня?</b></label>${scale("energy", ["нет сил", "мало", "норма", "хорошо", "полон сил"], c.energy)}
        <label><b>Настроение?</b></label>${scale("mood", ["плохо", "так себе", "норм", "хорошо", "отлично"], c.mood)}
        <label><b>Что мешает заниматься?</b></label>
        <div class="chips">${window.BARRIERS.map(b => `<label class="chip"><input type="radio" name="barrier" value="${b.id}" ${b.id === c.barrier ? "checked" : ""}><span>${esc(b.label)}</span></label>`).join("")}</div>
        <label><b>Что понравилось в приложении?</b></label><textarea name="liked" rows="2" maxlength="500">${esc(c.liked)}</textarea>
        <label><b>Что не понравилось и почему?</b></label><textarea name="disliked" rows="2" maxlength="500">${esc(c.disliked)}</textarea>
        <label><b>Что было бы круто?</b></label><textarea name="idea" rows="2" maxlength="500">${esc(c.idea)}</textarea>
        <button class="wide" type="submit">${todayCheckin() ? "Обновить отзыв" : "Сохранить отзыв"}</button>
      </form>`;
    document.getElementById("ci").onsubmit = ev => {
      ev.preventDefault();
      const f = ev.target;
      saveCheckin({ energy: f.energy.value, mood: f.mood.value, barrier: f.barrier.value, liked: f.liked.value, disliked: f.disliked.value, idea: f.idea.value });
      checkin(true);
      window.scrollTo(0, 0);
    };
  }

  // --- питание ---
  function food() {
    const items = foodToday();
    const total = items.reduce((s, x) => s + x.f.kcal, 0);
    const goal = state.kcalGoal;
    const pct = Math.min(100, total / goal * 100);
    app.innerHTML = `<h1>Питание</h1><p class="muted">Значения ориентировочные. Это дневник, а не диета: общие советы, не медицинские рекомендации.</p>
      <div class="card"><div class="row"><div><div class="big">${total}</div><div class="muted">ккал из ${goal}</div></div>
        <div style="text-align:right"><label class="muted">Цель, ккал</label><br><input id="goal" type="number" min="800" max="6000" step="50" value="${goal}" style="width:100px"></div></div>
        <div class="bar" style="margin-top:10px"><i style="width:${pct}%"></i></div>
        <p class="muted">${total > goal ? "Больше цели на " + (total - goal) + " ккал — один день ничего не решает." : "Осталось " + (goal - total) + " ккал."}</p></div>
      <h2>По фото <span class="tag">эксперимент</span></h2>
      <div class="card" id="photobox">
        <p class="muted">Сфотографируй блюдо — модель в браузере подскажет, что это. Размер порции выбираешь ты. Модель знает общие продукты (фрукты, овощи, пиццу, бургер), но не знает плов, бешбармак, баурсаки — для них выбери вручную ниже. Фото не отправляется на сервер.</p>
        <input type="file" id="photo" accept="image/*" capture="environment">
        <div id="photoout"></div>
      </div>
      <h2>Быстро добавить</h2>
      <div class="chips">${window.FOOD_PRESETS.map((f, i) => `<button class="ghost" data-preset="${i}">${esc(f.name)} · ${f.kcal}</button>`).join("")}</div>
      <h2>Своё</h2>
      <form id="ff" class="card row"><input name="name" placeholder="Что съел" maxlength="60" style="flex:1" required><input name="kcal" type="number" min="1" max="5000" placeholder="ккал" style="width:90px" required><button type="submit">+</button></form>
      <h2>Сегодня</h2>
      ${items.length ? items.map(({ f, i }) => `<div class="card row"><span>${esc(f.name)}</span><span><b>${f.kcal}</b> <button class="ghost" data-del="${i}">✕</button></span></div>`).join("") : "<p class='muted'>Пока ничего не добавлено.</p>"}`;
    app.querySelectorAll("[data-preset]").forEach(b => b.onclick = () => { const f = window.FOOD_PRESETS[+b.dataset.preset]; addFood(f.name, f.kcal); food(); });
    app.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { state.food.splice(+b.dataset.del, 1); save(); food(); });
    document.getElementById("ff").onsubmit = ev => { ev.preventDefault(); const f = ev.target; if (addFood(f.name.value, f.kcal.value)) food(); };
    document.getElementById("photo").onchange = ev => photoFlow(ev.target.files && ev.target.files[0]);
    document.getElementById("goal").onchange = ev => { const v = Math.round(Number(ev.target.value)); if (v >= 800 && v <= 6000) { state.kcalGoal = v; save(); food(); } };
  }

  // Фото блюда → подсказка по модели → пользователь выбирает порцию и подтверждает.
  const PORTIONS = [["0.5", "½ порции"], ["1", "1 порция"], ["1.5", "1½ порции"], ["2", "2 порции"]];
  async function photoFlow(file) {
    const out = document.getElementById("photoout");
    if (!file) { out.innerHTML = ""; return; }
    if (!/^image\//.test(file.type)) { out.innerHTML = "<p class='status'>Нужен файл-картинка.</p>"; return; }
    const url = URL.createObjectURL(file);
    out.innerHTML = `<img id="pimg" src="${url}" alt="фото блюда" style="width:100%;max-height:260px;object-fit:contain;border-radius:10px;margin-top:10px"><div class="status" id="pstat">Загружаю модель (около 15 МБ, один раз) и распознаю…</div><div id="pres"></div>`;
    const img = document.getElementById("pimg"), stat = document.getElementById("pstat"), res = document.getElementById("pres");
    try {
      if (!img.complete) await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error("не удалось открыть картинку")); });
      const { preds, matches } = await window.Photo.recognize(img);
      if (!document.getElementById("pres")) return; // пользователь ушёл со страницы
      if (!matches.length) {
        stat.textContent = "Не нашёл знакомой еды (модель видит: " + preds.slice(0, 2).map(p => p.className.split(",")[0]).join(", ") + "). Выбери блюдо вручную ниже.";
        return;
      }
      stat.textContent = "Возможно, это:";
      res.innerHTML = matches.slice(0, 3).map((m, i) => `<div class="card row"><div><b>${esc(m.food.name)}</b><div class="muted">${m.food.kcal} ккал · уверенность ${Math.round(m.prob * 100)}%</div></div>
        <div><select data-por="${i}">${PORTIONS.map(([v, l]) => `<option value="${v}" ${v === "1" ? "selected" : ""}>${l}</option>`).join("")}</select> <button data-add="${i}">Добавить</button></div></div>`).join("");
      res.querySelectorAll("[data-add]").forEach(b => b.onclick = () => {
        const i = +b.dataset.add, k2 = Number(res.querySelector(`[data-por="${i}"]`).value);
        addFood(matches[i].food.name, Math.round(matches[i].food.kcal * k2));
        food();
      });
    } catch (e) {
      stat.textContent = "Не удалось распознать (" + (e && e.message ? e.message : "ошибка") + "). Нужен интернет для загрузки модели. Выбери блюдо вручную ниже.";
    }
  }

  // --- профиль ---
  function profile() {
    const doneVideos = allExercises().filter(({ p, e }) => state.done[k(p.id, e.id)]);
    const history = state.log.slice().reverse().map(l => {
      const p = PROGRAMS.find(x => x.id === l.p), d = p && p.days.find(x => x.id === l.d);
      return `<li>${esc(l.date)} · ${esc(p ? p.title : l.p)} · ${esc(d ? d.title : l.d)} · +${l.points}</li>`;
    }).join("");
    app.innerHTML = `<h1>Профиль</h1>
      <div class="card"><div class="muted">Баллы</div><div class="big">${totalPoints()}</div></div>
      ${statsHtml()}
      ${profileCardHtml()}
      <div class="card"><label class="muted">Имя</label><div class="row" style="margin-top:6px"><input id="name" value="${esc(state.name)}" maxlength="30" style="flex:1"><button id="saveName">Сохранить</button></div></div>
      <div class="card"><b>Тренировки (${state.log.length})</b>${history ? "<ul>" + history + "</ul>" : "<p class='muted'>Пока нет — откройте программу и отметьте первую тренировку.</p>"}</div>
      <div class="card"><b>Изучена техника (${doneVideos.length})</b>${doneVideos.length ? "<ul>" + doneVideos.map(({ p, e }) => `<li>${esc(e.title)} · ${esc(p.title)} · +${e.points}</li>`).join("") + "</ul>" : "<p class='muted'>Пока нет видео.</p>"}</div>
      <div class="card"><b>Выгрузка для разбора</b><p class="muted">Отчёт с отзывами, профилем и тренировками. Принеси его в чат с Claude — я разберу свободные тексты.</p>
        <div class="row"><button id="copy">Скопировать</button><button id="dl" class="ghost">Скачать .md</button></div><textarea id="rep" rows="6" readonly style="width:100%;margin-top:10px"></textarea></div>
      <div class="card"><b>Для демонстрации</b><p class="muted">Заполнить двухнедельными демо-данными, чтобы сразу показать профиль и советы. Текущие данные будут заменены.</p>
        <div class="row"><button id="demo" class="ghost">Загрузить демо</button><button class="ghost" id="reset">Сбросить прогресс</button></div></div>`;
    const rep = document.getElementById("rep");
    rep.value = buildReport();
    document.getElementById("copy").onclick = () => {
      rep.select();
      try { navigator.clipboard.writeText(rep.value); } catch (e) { document.execCommand("copy"); }
      document.getElementById("copy").textContent = "Скопировано ✓";
    };
    document.getElementById("dl").onclick = () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([rep.value], { type: "text/markdown;charset=utf-8" }));
      a.download = "fitwatch-report-" + today() + ".md";
      a.click();
    };
    document.getElementById("saveName").onclick = () => { state.name = document.getElementById("name").value.trim() || "Гость"; save(); profile(); };
    document.getElementById("demo").onclick = () => { if (confirm("Заменить текущие данные демо-данными?")) { loadDemo(); profile(); } };
    document.getElementById("reset").onclick = () => { if (confirm("Сбросить все баллы и прогресс?")) { state = Object.assign(fresh(), { name: state.name }); save(); profile(); } };
  }

  function notFound() { app.innerHTML = "<h1>Не найдено</h1><a class='back' href='#/'>← На главную</a>"; }

  // ---------- YouTube IFrame API ----------
  let ytCallbacks = [], ytLoading = false;
  function withYouTube(cb) {
    if (window.YT && YT.Player) return cb();
    ytCallbacks.push(cb);
    if (ytLoading) return;
    ytLoading = true;
    window.onYouTubeIframeAPIReady = () => { ytCallbacks.forEach(f => f()); ytCallbacks = []; };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  }

  // ---------- роутер ----------
  function route() {
    stopPlayer();
    ytCallbacks = [];
    const [, a, b, c] = location.hash.split("/");
    if (a === "p") program(b);
    else if (a === "d") day(b, c);
    else if (a === "e") exercise(b, c);
    else if (a === "checkin") checkin();
    else if (a === "food") food();
    else if (a === "profile") profile();
    else if (a === "programs") programs();
    else if (a === "trainer") trainer();
    else home();
    const tab = { p: "programs", d: "programs", e: "programs", programs: "programs", food: "food", trainer: "trainer", checkin: "trainer", profile: "profile" }[a] || "home";
    document.querySelectorAll("#tabbar a").forEach(t => t.classList.toggle("on", t.dataset.t === tab));
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  renderBadge();
  route();
})();
