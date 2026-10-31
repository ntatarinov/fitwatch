(function () {
  "use strict";
  const KEY = "fitwatch.v1";
  const app = document.getElementById("app");
  const badge = document.getElementById("badge");
  const PROGRAMS = window.PROGRAMS;
  const Engine = window.Engine;
  const Tree = window.Tree;
  const LIB_POINTS = 5; // баллы за просмотр видео упражнения из каталога
  window.Catalog.resolve(PROGRAMS);

  // ---------- состояние профиля (localStorage) ----------
  // seen — открытые достижения, о которых уже сказали; lvl — последний показанный уровень (null/0 — ещё не отмечено)
  // me — анкета (цель, уровень, дни, ограничения, параметры); plan — подобранный план {builtAt, params, days, warnings};
  // done/watched — просмотр видео; log — отметки «Я потренировался» [{date,p,d,points,t}];
  // checkins — ежедневный отзыв [{date,energy,mood,barrier,liked,disliked,idea}];
  // food — дневник питания [{date,name,kcal, p,f,c,grams,nid}] (БЖУ может не быть)
  const fresh = () => ({ name: "Гость", done: {}, watched: {}, log: [], checkins: [], food: [], kcalGoal: window.KCAL_DEFAULT, me: null, plan: null, seen: null, lvl: 0, sleep: [] });
  function load() {
    try { return Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY))); }
    catch (e) { return fresh(); }
  }
  const hadStored = (() => { try { return localStorage.getItem(KEY) !== null; } catch (e) { return false; } })();
  let state = load();
  if (!hadStored) { state.seen = []; state.lvl = 1; } // новый человек: все достижения впереди и о них скажем
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function save() { persist(); renderBadge(); if (!checkTimer) checkTimer = setTimeout(checkProgress, 0); }
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
    const lib = Object.keys(state.done).filter(x => x.startsWith("lib/")).length * LIB_POINTS;
    return watch + lib + state.log.reduce((s, l) => s + l.points, 0);
  }
  const trainedToday = () => state.log.some(l => l.date === today());
  const todayCheckin = () => state.checkins.find(c => c.date === today()) || null;
  function progressStats() {
    return { workouts: workoutDates().length, streak: streak(), points: totalPoints(), checkins: state.checkins.length,
      foodDays: new Set(state.food.map(f => f.date)).size, videos: Object.keys(state.done).filter(x => state.done[x]).length, hasPlan: !!state.plan };
  }
  // Проверка нового уровня и достижений после любого сохранения. У тех, у кого данные уже были, всё открытое отмечается тихо.
  let checkTimer = null;
  function checkProgress() {
    checkTimer = null;
    const A = window.Achievements, X = window.FX, s = progressStats(), ids = A.unlockedIds(s), L = A.levelOf(s.points);
    if (state.seen == null) { state.seen = ids; state.lvl = L.index; persist(); return; }
    const fresh = ids.filter(id => !state.seen.includes(id)), up = L.index > (state.lvl || 1);
    if (!fresh.length && !up && L.index === state.lvl) return;
    state.seen = state.seen.concat(fresh); state.lvl = L.index; persist();
    if (up) { X.toast("Новый уровень: " + L.title + "!", "🏆"); X.play("level"); }
    fresh.forEach((id, i) => setTimeout(() => {
      const b = A.BADGES.find(x => x.id === id);
      X.toast("Достижение: " + b.title, b.emoji);
      if (!up) X.play("badge");
    }, 700 * (i + (up ? 1 : 0))));
  }
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
      sleepHours: sleepToday() ? sleepToday().hours : null,
    });
  }
  // Первый ещё не пройденный день основных программ (или первый день).
  function nextDayHref() {
    if (state.plan && state.plan.days.length) {
      const n = state.log.filter(l => l.p === "plan" && l.date >= state.plan.builtAt).length;
      return "#/pd/" + state.plan.days[n % state.plan.days.length].id;
    }
    for (const p of PROGRAMS.filter(x => x.id !== "stretch")) {
      for (const d of p.days) if (!state.log.some(l => l.p === p.id && l.d === d.id)) return `#/d/${p.id}/${d.id}`;
    }
    return "#/d/start/d1";
  }

  // ---------- действия (без работы со страницей — их можно проверять тестом) ----------
  // Сон: одна запись в день (часы и оценка); совет дня учитывает недосып.
  function saveSleep(hours, quality) {
    const rec = { date: today(), hours: Math.min(14, Math.max(0, Number(hours) || 0)), quality: Math.min(5, Math.max(1, Math.round(Number(quality)) || 3)) };
    const i = state.sleep.findIndex(r => r.date === rec.date);
    if (i >= 0) state.sleep[i] = rec; else state.sleep.push(rec);
    save();
  }
  const sleepToday = () => state.sleep.find(r => r.date === today()) || null;
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
    state.log.push({ date: today(), p: p.id, d: d.id, points: dayPoints(d), t: d.title });
    save();
    // Если человек вошёл в аккаунт, тренировка записывается и на сервер: оттуда очки и бонусы для рейтинга.
    window.Account.recordWorkout({ day: today(), program: p.id, dayId: d.id, title: d.title }).then(r => {
      if (r.ok && r.data.bonus) window.FX.toast("Бонус за серию: +" + r.data.bonus + " очков", "🔥");
      if (r.ok) window.Account.refresh();
    });
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
    state.seen = window.Achievements.unlockedIds(progressStats());
    state.lvl = window.Achievements.levelOf(totalPoints()).index;
    save();
  }

  // ---------- отчёт для выгрузки ----------
  function buildReport() {
    const pr = profileNow(), lines = [];
    lines.push(`# Отчёт FitWatch — ${state.name}, ${today()}`);
    lines.push("", "_Отправь этот файл тренеру или команде: разобрать свободные тексты, найти повторяющиеся жалобы и предложить, что изменить в приложении._", "");
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
    if (state.me) {
      const m = state.me;
      lines.push("", "## Анкета", `Цель: ${labelOf(window.Planner.GOALS, m.goal)} · уровень ${labelOf(window.Catalog.LEVELS, m.level)} · ${m.days} дн. в неделю по ${m.minutes} мин · ${labelOf(window.Planner.PLACES, m.place)}` + (m.limits.length ? ` · ограничения: ${m.limits.map(l => labelOf(window.Catalog.LIMITS, l)).join(", ")}` : ""));
    }
    if (state.sleep.length) lines.push("", "## Сон (последние записи)", ...state.sleep.slice(-7).map(r => `- ${r.date} · ${r.hours} ч · оценка ${r.quality}/5`));
    lines.push("", "## Отзывы по дням");
    state.checkins.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).forEach(c => {
      lines.push(`- ${c.date} · энергия ${c.energy}, настроение ${c.mood}, мешает: ${labelOf(window.BARRIERS, c.barrier)}` +
        (c.liked ? ` · понравилось: ${c.liked}` : "") + (c.disliked ? ` · не понравилось: ${c.disliked}` : "") + (c.idea ? ` · идея: ${c.idea}` : ""));
    });
    if (!state.checkins.length) lines.push("- отзывов нет");
    lines.push("", "## Тренировки");
    state.log.forEach(l => lines.push(`- ${l.date} · ${l.p === "plan" ? "Мой план: " + (l.t || l.d) : l.p + "/" + l.d} · +${l.points}`));
    if (!state.log.length) lines.push("- тренировок нет");
    lines.push("", "## Питание сегодня");
    const ft = foodToday(), fs = window.Nutrition.sum(ft.map(x => x.f));
    ft.forEach(({ f }) => lines.push(`- ${f.name} · ${f.kcal} ккал` + (f.p != null ? ` · Б ${f.p} Ж ${f.f} У ${f.c}` : "")));
    lines.push(`Итого: ${fs.kcal} из ${state.kcalGoal} ккал · Б ${fs.p} Ж ${fs.f} У ${fs.c}`);
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

  const weekMsg = (n, goal) => n >= goal ? "Цель недели выполнена! Так держать." : n === 0 ? "Начни с одной тренировки: серия ждёт тебя." : "Осталось " + (goal - n) + " — ты справишься.";
  function weekCardHtml() {
    const goal = state.plan ? state.plan.days.length : 3, n = weekCount(), st = streak();
    const pct = Math.min(100, Math.round(n / goal * 100)), off = Math.round(264 - 264 * pct / 100);
    const dots = window.Achievements.weekDots(workoutDates().map(dayNum), dayNum(today())).map(d => `<div class="dot ${d.done ? "done" : ""} ${d.today ? "today" : ""}"><i>${d.done ? "✓" : ""}</i>${d.label}</div>`).join("");
    return `<div class="card"><div class="week">
        <div class="ring" role="img" aria-label="Тренировок за неделю: ${n} из ${goal}"><svg width="112" height="112" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3ee0a4"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>
          <circle class="trk" cx="50" cy="50" r="42" fill="none" stroke-width="9"/><circle class="val" cx="50" cy="50" r="42" fill="none" stroke-width="9" stroke-dasharray="264" style="stroke-dashoffset:${off};--off:${off}"/></svg>
          <div class="num"><b>${n}/${goal}</b><small>за 7 дней</small></div></div>
        <div style="flex:1"><div class="streak"><span class="flame ${st ? "" : "off"}">🔥</span><span class="n">${st}</span></div><div class="muted">тренировок в серии</div>
          <div class="muted tiny" style="margin-top:6px">${weekMsg(n, goal)}</div></div></div>
      <div class="dots">${dots}</div></div>`;
  }
  function levelCardHtml() {
    const A = window.Achievements, pts = totalPoints(), L = A.levelOf(pts), nb = A.nextBadge(progressStats());
    return `<div class="card"><div class="row"><b>Уровень ${L.index} · ${esc(L.title)}</b><span class="muted">${pts} баллов</span></div>
      <div class="xp" style="margin:10px 0 6px"><i style="width:0" data-w="${L.pct}"></i></div>
      <div class="muted tiny">${L.next ? "До уровня «" + esc(L.next) + "» осталось " + L.toNext + " баллов" : "Максимальный уровень: ты легенда!"}${nb ? " · Следующее достижение: " + nb.emoji + " " + esc(nb.title) + " (" + esc(nb.hint) + ")" : ""}</div></div>`;
  }
  function badgesHtml() {
    const list = window.Achievements.evaluate(progressStats()), got = list.filter(b => b.got).length;
    return `<div class="card"><div class="row"><b>Достижения</b><span class="muted">${got} из ${list.length}</span></div><div class="badges" style="margin-top:10px">${list.map(b => `<div class="bd ${b.got ? "got" : "lock"}"><span class="em">${b.emoji}</span><b>${esc(b.title)}</b><small>${b.got ? "Открыто" : esc(b.hint)}</small></div>`).join("")}</div></div>`;
  }
  // Шкала уровня заполняется после появления на экране, чтобы было видно движение.
  function animateBars() {
    const go = () => document.querySelectorAll(".xp > i[data-w]").forEach(el => { el.style.width = el.dataset.w + "%"; });
    (window.requestAnimationFrame || (f => setTimeout(f, 30)))(() => (window.requestAnimationFrame || (f => setTimeout(f, 30)))(go));
  }
  function sleepCardHtml() {
    const r = sleepToday();
    return `<a class="card" href="#/sleep"><div class="row"><div><b>😴 Сон</b><div class="muted tiny">${r ? "Сегодня записано: " + r.hours + " ч" : "Запиши, как спал: советы подстроятся"}</div></div><span class="pill">${r ? "Изменить" : "Записать"}</span></div></a>`;
  }
  function planCardHtml() {
    if (!state.me) return `<div class="card"><b>Твоя цель</b><p class="muted">Расскажи о цели, уровне и ограничениях, и я подберу план тренировок.</p><a class="btn" href="#/me">Подобрать план</a></div>`;
    const dates = state.plan ? state.plan.days.length : 0;
    return `<a class="card" href="${nextDayHref()}"><div class="row"><div><b>Мой план</b><div class="muted">${esc(labelOf(window.Planner.GOALS, state.me.goal))} · ${dates} дн. в неделю</div></div><span class="pill">Дальше →</span></div></a>`;
  }
  function meCardHtml() {
    if (!state.me) return `<div class="card"><b>Моя цель и параметры</b><p class="muted">Пока не заполнено.</p><a class="btn" href="#/me">Заполнить анкету</a></div>`;
    const m = state.me, C = window.Catalog;
    return `<div class="card"><b>Моя цель и параметры</b><p>${esc(labelOf(window.Planner.GOALS, m.goal))} · ${esc(labelOf(C.LEVELS, m.level))} · ${m.days} дн. по ${m.minutes} мин · ${esc(labelOf(window.Planner.PLACES, m.place))}</p>
      <p class="muted">${m.limits.length ? "Ограничения: " + esc(m.limits.map(l => labelOf(C.LIMITS, l)).join(", ")) : "Ограничений не указано"}</p><a class="btn" href="#/me">Изменить</a></div>`;
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

  // Данные для чек-листа «Первые шаги»: считаются из прогресса и входа в аккаунт.
  function stepsCtx() {
    return { hasPlan: !!state.plan, workouts: state.log.length, foodEntries: state.food.length, loggedIn: window.Account.state.status === "user", nextHref: nextDayHref() };
  }
  function home() {
    const L0 = window.Achievements.levelOf(totalPoints());
    const head = `<div class="greet"><h1>Привет, ${esc(state.name)}</h1><div class="lvl"><b>${esc(L0.title)}</b><small>уровень ${L0.index}</small></div></div>`;
    if (!window.Guide.isPro()) {
      // Простой режим: что делать сейчас, неделя и уровень. Остальное за кнопкой Pro.
      const st = window.Guide.steps(stepsCtx());
      const steps = window.Guide.stepsHidden() ? "" : PAGES.stepsCard(st, false);
      const install = !window.Guide.installHidden() && window.Pwa ? window.Pwa.card({ dismissible: true }) : "";
      // Пока нет плана, ведёт чек-лист: совет дня с отзывом или тренировкой новичка только запутал бы.
      const advice = state.plan || window.Guide.stepsHidden() ? adviceHtml() : "";
      app.innerHTML = head + steps + advice + weekCardHtml() + levelCardHtml() + planCardHtml() + install + PAGES.proTeaser();
      animateBars();
      return;
    }
    app.innerHTML = head +
      adviceHtml() + weekCardHtml() + levelCardHtml() + planCardHtml() + sleepCardHtml() + PAGES.accountCard(FW) + PAGES.ideasCard() + "<h2>Программы</h2><div class='tiles'>" +
      PROGRAMS.map(p => `<a class="tile t-${p.id}" href="#/p/${p.id}"><span class="ic">${p.icon || "🏋️"}</span><b>${esc(p.title)}</b><small>${doneDays(p)}/${p.days.length} дн.</small></a>`).join("") +
      "</div>";
    animateBars();
  }

  function programs() {
    const planLink = state.plan
      ? `<a class="card" href="#/plan"><div class="row"><div><b>📅 Мой план</b><div class="muted">${esc(labelOf(window.Planner.GOALS, state.me.goal))} · ${state.plan.days.length} дн. в неделю</div></div><span class="pill">Открыть</span></div></a>`
      : `<a class="card" href="#/me"><div class="row"><div><b>📅 Мой план</b><div class="muted">Подберём тренировки под твою цель</div></div><span class="pill">Подобрать</span></div></a>`;
    const pro = window.Guide.isPro();
    const proCards = pro ? `<a class="card" href="#/trainers"><div class="row"><div><b>👥 Тренеры и чат</b><div class="muted">Персональный тренер, переписка, согласие на доступ к данным</div></div><span class="pill">Открыть</span></div></a>` +
      `<a class="card" href="#/premium"><div class="row"><div><b>💎 Расширенные программы</b><div class="muted">Программы на 4–8 недель по подписке</div></div><span class="pill">Открыть</span></div></a>` +
      `<a class="card" href="#/trainer"><div class="row"><div><b>💬 Тренер</b><div class="muted">Диалог по правилам: цель, питание, самочувствие</div></div><span class="pill">Открыть</span></div></a>` : "";
    app.innerHTML = "<h1>Тренировки</h1>" + planLink + proCards +
      `<a class="card" href="#/library"><div class="row"><div><b>🧍 Каталог упражнений</b><div class="muted">По мышцам, оборудованию и уровню, с моделью тела</div></div><span class="pill">${window.Catalog.EXERCISES.length}</span></div></a>` +
      "<h2>Готовые программы</h2>" + PROGRAMS.map(p =>
      `<a class="card" href="#/p/${p.id}"><div class="row"><div><b>${p.icon || ""} ${esc(p.title)}</b><div class="muted">${esc(p.description)}</div></div>
        <span class="pill ${doneDays(p) === p.days.length ? "done" : ""}">${doneDays(p)}/${p.days.length} дн.</span></div></a>`).join("") + (pro ? "" : PAGES.proTeaser());
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

  function renderCheckin(p, d, justDone, rerender) {
    const box = document.getElementById("checkin");
    const pts = dayPoints(d);
    if (justDone) {
      box.innerHTML = `<div class="celebrate"><span class="em">🎉</span><div class="pts">+<span id="cu">0</span></div><div><b>Тренировка засчитана!</b></div>
        <div class="muted">Серия: ${streak()} · всего ${totalPoints()} баллов. Следующая — завтра или через день: отдых тоже часть программы.</div></div>`;
      window.FX.countUp(document.getElementById("cu"), 0, pts, 900);
      return;
    }
    if (trainedToday()) {
      box.innerHTML = `<div class="status ok">✓ Сегодняшняя тренировка уже засчитана. Следующая — завтра или через день: отдых тоже часть программы.</div>`;
      return;
    }
    box.innerHTML = `<button id="done" class="wide">Я потренировался (+${pts})</button>
      <p class="muted">Отмечайте честно: за один календарный день засчитывается одна тренировка.</p>`;
    document.getElementById("done").onclick = () => { if (logWorkout(p, d)) { window.FX.celebrate(); (rerender || (() => day(p.id, d.id, true)))(); } };
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
    renderExercise({ e, key: k(pid, eid), backHref: `#/p/${p.id}`, backLabel: "← " + p.title, points: e.points, meta: "" });
  }

  // Страница упражнения: видео (если есть) со счётчиком просмотра, техника. Общая для программ и каталога.
  function renderExercise({ e, key, backHref, backLabel, points, meta }) {
    app.innerHTML = `<a class="back" href="${backHref}">${esc(backLabel)}</a><h1>${esc(e.title)}</h1><p class="muted">${esc(e.summary)}</p>${meta || ""}
      ${e.video ? `<div class="video"><div id="yt"></div></div><div class="bar"><i id="bar"></i></div>` : `<div class="card"><p class="muted">Видео для этого упражнения пока нет. Техника описана ниже.</p></div>`}
      <div class="status" id="status"></div>
      <div class="card"><b>Как выполнять</b><ol>${e.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
        <p><b>Частые ошибки:</b> ${esc(e.mistakes)}</p><p><b>Дозировка:</b> ${esc(e.dose)}</p></div>`;
    if (!e.video) return;
    const bar = document.getElementById("bar"), status = document.getElementById("status");
    let duration = 0;

    function paint() {
      const need = duration ? duration * window.WATCH_THRESHOLD : 0;
      const w = state.watched[key] || 0;
      bar.style.width = (state.done[key] ? 100 : need ? Math.min(100, w / need * 100) : 0) + "%";
      if (state.done[key]) { status.textContent = "✓ Техника изучена, +" + points + " баллов в профиле"; status.className = "status ok"; }
      else { status.textContent = "Посмотрите видео — небольшие баллы начислятся автоматически (+" + points + "). Основные баллы — за тренировку."; status.className = "status"; }
    }
    paint();

    function tick() {
      if (!player || player.getPlayerState() !== 1) return; // 1 = идёт воспроизведение
      duration = player.getDuration();
      if (state.done[key] || !duration) return;
      state.watched[key] = (state.watched[key] || 0) + 1;
      const wasDone = !!state.done[key];
      if (state.watched[key] >= duration * window.WATCH_THRESHOLD) state.done[key] = true;
      save(); paint();
      if (state.done[key] && !wasDone) { window.FX.toast("Техника изучена: +" + points + " баллов", "🎬"); window.FX.play("tap"); }
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

  // --- питание: страница в pages.js ---
  function food() { PAGES.food(FW); }

  // --- профиль ---
  function profile() {
    const doneVideos = allExercises().filter(({ p, e }) => state.done[k(p.id, e.id)]);
    const history = state.log.slice().reverse().map(l => {
      if (l.p === "plan") return `<li>${esc(l.date)} · Мой план · ${esc(l.t || l.d)} · +${l.points}</li>`;
      const p = PROGRAMS.find(x => x.id === l.p), d = p && p.days.find(x => x.id === l.d);
      if (!p) return `<li>${esc(l.date)} · ${esc(l.t || l.p + "/" + l.d)} · +${l.points}</li>`;
      return `<li>${esc(l.date)} · ${esc(p ? p.title : l.p)} · ${esc(d ? d.title : l.d)} · +${l.points}</li>`;
    }).join("");
    const pro = window.Guide.isPro();
    const installCard = window.Pwa ? window.Pwa.card() : "";
    app.innerHTML = `<h1>Профиль</h1>
      <div class="card"><div class="row"><b>Режим</b><a class="pill" href="#/guide">Как пользоваться</a></div>${PAGES.modeSwitch()}</div>
      ${installCard}
      ${PAGES.accountCard(FW)}
      ${pro ? PAGES.ideasCard() : ""}
      <div class="card"><div class="muted">Баллы</div><div class="big">${totalPoints()}</div></div>
      ${statsHtml()}
      ${badgesHtml()}
      ${pro ? profileCardHtml() : ""}
      ${meCardHtml()}
      <div class="card"><label class="muted">Имя</label><div class="row" style="margin-top:6px"><input id="name" value="${esc(state.name)}" maxlength="30" style="flex:1"><button id="saveName">Сохранить</button></div></div>
      <div class="card"><b>Тренировки (${state.log.length})</b>${history ? "<ul>" + history + "</ul>" : "<p class='muted'>Пока нет — откройте программу и отметьте первую тренировку.</p>"}</div>
      ${pro ? `<div class="card"><b>Изучена техника (${doneVideos.length})</b>${doneVideos.length ? "<ul>" + doneVideos.map(({ p, e }) => `<li>${esc(e.title)} · ${esc(p.title)} · +${e.points}</li>`).join("") + "</ul>" : "<p class='muted'>Пока нет видео.</p>"}</div>
      <div class="card"><b>Выгрузка для разбора</b><p class="muted">Отчёт с отзывами, профилем и тренировками. Отправь его тренеру или команде: из него видно свободные тексты и повторяющиеся жалобы.</p>
        <div class="row"><button id="copy">Скопировать</button><button id="dl" class="ghost">Скачать .md</button></div><textarea id="rep" rows="6" readonly style="width:100%;margin-top:10px"></textarea></div>
      <div class="card"><b>Для демонстрации</b><p class="muted">Заполнить двухнедельными демо-данными, чтобы сразу показать профиль и советы. Текущие данные будут заменены.</p>
        <div class="row"><button id="demo" class="ghost">Загрузить демо</button><button class="ghost" id="reset">Сбросить прогресс</button></div></div>` : ""}`;
    // Блок для Pro есть не всегда: обработчики вешаются только на то, что есть на странице.
    const on = (id, f) => { const el = document.getElementById(id); if (el) el.onclick = f; };
    const rep = document.getElementById("rep");
    if (rep) rep.value = buildReport();
    on("copy", () => {
      rep.select();
      try { navigator.clipboard.writeText(rep.value); } catch (e) { document.execCommand("copy"); }
      document.getElementById("copy").textContent = "Скопировано ✓";
    });
    on("dl", () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([rep.value], { type: "text/markdown;charset=utf-8" }));
      a.download = "fitwatch-report-" + today() + ".md";
      a.click();
    });
    on("saveName", () => { state.name = document.getElementById("name").value.trim() || "Гость"; save(); profile(); });
    on("demo", () => { if (confirm("Заменить текущие данные демо-данными?")) { loadDemo(); profile(); } });
    on("reset", () => { if (confirm("Сбросить все баллы и прогресс?")) { state = Object.assign(fresh(), { name: state.name, me: state.me, plan: state.plan }); save(); profile(); } });
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
    if (PAGES._cleanup) PAGES._cleanup(); // остановить опрос чата и подобное
    app.classList.remove("enter"); void app.offsetWidth; app.classList.add("enter");
    stopPlayer();
    ytCallbacks = [];
    const [, a, b, c] = location.hash.split("/");
    if (a === "p") program(b);
    else if (a === "d") day(b, c);
    else if (a === "e") exercise(b, c);
    else if (a === "me") PAGES.me(FW);
    else if (a === "plan") PAGES.plan(FW);
    else if (a === "pd") PAGES.planDay(FW, b);
    else if (a === "library") PAGES.library(FW, b);
    else if (a === "x") PAGES.exercise(FW, b);
    else if (a === "ideas") PAGES.ideas(FW, b);
    else if (a === "sleep") PAGES.sleep(FW);
    else if (a === "tariffs") PAGES.tariffs(FW);
    else if (a === "premium") PAGES.premium(FW);
    else if (a === "pp") PAGES.premiumProgram(FW, b);
    else if (a === "ppd") PAGES.premiumDay(FW, b, c);
    else if (a === "trainers") PAGES.trainers(FW);
    else if (a === "coach") PAGES.coach(FW);
    else if (a === "client") PAGES.clientView(FW, b);
    else if (a === "chat") PAGES.chat(FW, b);
    else if (a === "admin") PAGES.admin(FW);
    else if (a === "account") PAGES.account(FW, b);
    else if (a === "rating") PAGES.rating(FW, b);
    else if (a === "body") PAGES.body(FW, b);
    else if (a === "guide") PAGES.guide(FW);
    else if (a === "checkin") checkin();
    else if (a === "food") food();
    else if (a === "profile") profile();
    else if (a === "programs") programs();
    else if (a === "trainer") trainer();
    else home();
    const tab = { p: "programs", d: "programs", e: "programs", programs: "programs", me: "programs", plan: "programs", pd: "programs", library: "programs", x: "programs", food: "food", trainer: "programs", checkin: "home", sleep: "home", tariffs: "programs", premium: "programs", pp: "programs", ppd: "programs", trainers: "programs", coach: "programs", client: "programs", chat: "programs", admin: "profile", ideas: "profile", rating: "rating", account: "profile", body: "profile", profile: "profile", guide: "profile" }[a] || "home";
    document.querySelectorAll("#tabbar a").forEach(t => t.classList.toggle("on", t.dataset.t === tab));
    window.scrollTo(0, 0);
  }
  // Контекст для страниц из pages.js: состояние берётся при каждом обращении (оно заменяется при сбросе и демо).
  const PAGES = window.PAGES;
  PAGES.stepsCtx = stepsCtx;
  const FW = { app, esc, today, k, get state() { return state; }, save, saveSleep, notFound, renderExercise, renderCheckin, go: h => { location.hash = h; } };
  const snd = document.getElementById("snd");
  const paintSnd = () => { const on = window.FX.enabled(); snd.textContent = on ? "🔊" : "🔇"; snd.setAttribute("aria-pressed", String(on)); snd.title = on ? "Звук включён" : "Звук выключен"; };
  snd.onclick = () => { window.FX.setEnabled(!window.FX.enabled()); paintSnd(); window.FX.play("tap"); };
  paintSnd();
  window.addEventListener("hashchange", route);
  // Изменился вход/выход: обновляем страницы, где виден аккаунт. Без сервера приложение работает как раньше.
  window.Account.onChange(() => { const a = location.hash.split("/")[1] || ""; if (["", "profile", "account", "rating", "body"].includes(a)) route(); });
  window.Account.refresh();
  renderBadge();
  // Режим и гайды: переключение перерисовывает страницу; приветствие показывается один раз.
  const guideToast = m => window.FX.toast(m === "pro" ? "Режим Pro: показаны все функции" : "Простой режим: только самое нужное", m === "pro" ? "⚡" : "🌱");
  PAGES.bindGuide({ rerender: route });
  window.Guide.onMode(m => { route(); guideToast(m); });
  window.Guide.apply();
  if (window.Pwa) { window.Pwa.onChange(() => { const a = location.hash.split("/")[1] || ""; if (["", "profile", "guide"].includes(a)) route(); }); window.Pwa.init(); }
  route();
  if (window.Guide.needsOnboarding()) window.Guide.showOnboarding(document, { onDone: () => route() });
})();
