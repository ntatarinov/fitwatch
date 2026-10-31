// Режимы «Простой» и «Pro», приветствие, чек-лист первых шагов и подсказки.
// Настройки лежат отдельно от прогресса (ключ fitwatch.ui), поэтому «Сбросить прогресс» их не стирает.
// Без хранилища (приватный режим) всё работает в памяти до закрытия страницы.
(function (root) {
  "use strict";
  const KEY = "fitwatch.ui";
  const MODES = ["simple", "pro"];
  let memory = null;

  const defaults = () => ({ mode: "simple", onboarded: false, tips: {}, stepsHidden: false, installHidden: false });
  function read() {
    let raw = null;
    try { raw = root.localStorage.getItem(KEY); } catch (e) { return memory ? Object.assign(defaults(), memory) : defaults(); }
    let p = {};
    try { p = JSON.parse(raw) || {}; } catch (e) { p = {}; }
    const d = defaults();
    return {
      mode: MODES.includes(p.mode) ? p.mode : d.mode,
      onboarded: p.onboarded === true,
      tips: p.tips && typeof p.tips === "object" && !Array.isArray(p.tips) ? p.tips : {},
      stepsHidden: p.stepsHidden === true,
      installHidden: p.installHidden === true,
    };
  }
  function write(p) {
    memory = p;
    try { root.localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* без хранилища настройки живут до перезагрузки */ }
  }
  const patch = f => { const p = read(); f(p); write(p); return p; };

  // ---------- режим ----------
  const listeners = [];
  const mode = () => read().mode;
  const isPro = () => mode() === "pro";
  function setMode(m) {
    if (!MODES.includes(m)) return false;
    const was = mode();
    patch(p => { p.mode = m; });
    apply();
    if (was !== m) listeners.slice().forEach(f => { try { f(m); } catch (e) { /* подписчик не должен ломать переключение */ } });
    return true;
  }
  const onMode = f => { listeners.push(f); };
  // Режим живёт на <body>: стили скрывают всё с классом pro-only (простой) или simple-only (Pro).
  function apply() {
    const doc = root.document;
    if (!doc || !doc.body) return;
    doc.body.dataset.mode = mode();
    doc.querySelectorAll("[data-modebtn]").forEach(b => { b.textContent = isPro() ? "Pro" : "Простой"; b.setAttribute("aria-label", "Режим: " + (isPro() ? "Pro" : "простой") + ". Нажми, чтобы переключить"); });
  }

  // ---------- первые шаги ----------
  // ctx: { hasPlan, workouts, foodEntries, loggedIn, nextHref }
  function steps(ctx) {
    const c = ctx || {};
    const list = [
      { id: "plan", emoji: "🎯", title: "Подбери план", hint: "Ответь на пару вопросов, и получишь тренировки под себя", href: "#/me", done: !!c.hasPlan },
      { id: "workout", emoji: "💪", title: "Сделай первую тренировку", hint: "Открой день плана и нажми «Я потренировался»", href: c.nextHref || "#/programs", done: (c.workouts || 0) > 0 },
      { id: "food", emoji: "🍎", title: "Запиши, что съел", hint: "Выбери продукт и граммы: калории и БЖУ посчитаются сами", href: "#/food", done: (c.foodEntries || 0) > 0 },
      { id: "account", emoji: "☁️", title: "Сохрани прогресс", hint: "Войди через Telegram или почту: данные не потеряются", href: "#/account", done: !!c.loggedIn },
    ];
    const done = list.filter(s => s.done).length;
    const current = list.find(s => !s.done) || null;
    return { list, done, total: list.length, pct: Math.round(done / list.length * 100), current, complete: done === list.length };
  }

  // ---------- подсказки на страницах ----------
  const TIPS = {
    me: ["🎯", "Ответь честно про ограничения: программа уберёт упражнения, которые тебе не подходят."],
    plan: ["📅", "Открой день плана и нажми «Я потренировался»: за каждый день баллы, а серия растёт."],
    library: ["🧍", "Нажми на мышцу на схеме тела, и останутся упражнения именно для неё."],
    food: ["🍎", "Выбери продукт и граммы: калории и БЖУ посчитаются сами. Массу в записи можно поправить."],
    sleep: ["😴", "Записывай сон по утрам. Если спал меньше 6 часов, совет дня предложит лёгкий день."],
    rating: ["🏆", "В рейтинге видны только те, кто сам согласился. Свой доступ включается в Профиле, в разделе «Аккаунт»."],
    trainers: ["👥", "Запрос тренеру доступен с тарифом «Персональный тренер». Тренер видит твои данные только с твоего согласия."],
    premium: ["💎", "Расширенные программы рассчитаны на 4–8 недель. Открыть их можно по подписке или промокоду."],
  };
  const known = id => Object.prototype.hasOwnProperty.call(TIPS, id);
  const tipSeen = id => Object.prototype.hasOwnProperty.call(read().tips, id);
  // Подсказки нужны новичку: в режиме Pro они скрыты.
  function tip(id) {
    if (!known(id) || isPro() || tipSeen(id)) return "";
    const t = TIPS[id];
    return `<div class="tip" data-tip="${id}" role="note"><span class="tip-ic" aria-hidden="true">${t[0]}</span><p>${t[1]}</p><button type="button" class="tip-x" data-tip-x="${id}">Понятно</button></div>`;
  }
  function dismissTip(id) { if (known(id)) patch(p => { p.tips[id] = true; }); }
  function resetTips() { patch(p => { p.tips = {}; p.stepsHidden = false; p.installHidden = false; }); }

  // ---------- приветствие ----------
  const needsOnboarding = () => !read().onboarded;
  function finishOnboarding(m) { patch(p => { p.onboarded = true; }); if (m) setMode(m); }
  const hideSteps = () => patch(p => { p.stepsHidden = true; });
  const stepsHidden = () => read().stepsHidden;
  const hideInstall = () => patch(p => { p.installHidden = true; });
  const installHidden = () => read().installHidden;

  const SLIDES = [
    { id: "hello", title: "Добро пожаловать в FitWatch", text: "Тренировки с видео, питание и мотивация в одном месте. Покажу за полминуты, как всё устроено.",
      art: `<div class="ob-orb"><span class="ob-float f1">💪</span><span class="ob-float f2">🍎</span><span class="ob-float f3">🔥</span><span class="ob-float f4">🏆</span><b class="ob-logo">FW</b></div>` },
    { id: "goal", title: "Выбери цель, получи план", text: "Ответишь на несколько вопросов о цели, уровне и ограничениях. Приложение соберёт неделю тренировок именно под тебя.",
      art: `<div class="ob-flow"><span style="--i:0">🎯 Цель</span><span style="--i:1">📶 Уровень</span><span style="--i:2">📆 Дни</span><span style="--i:3" class="ok">✓ Готов план</span></div>` },
    { id: "train", title: "Тренируйся и отмечай", text: "За каждую тренировку баллы, серия дней и новые уровни. Видео покажет технику, а лёгкий день не сломает серию.",
      art: `<div class="ob-ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="trk" cx="50" cy="50" r="42" fill="none" stroke-width="9"/><circle class="val" cx="50" cy="50" r="42" fill="none" stroke-width="9" stroke-dasharray="264" stroke-linecap="round"/></svg><div class="ob-num"><b>+20</b><small>баллов</small></div><span class="ob-flame">🔥</span></div>` },
    { id: "mode", title: "Как тебе удобнее?", text: "Режим можно сменить в любой момент кнопкой вверху.", art: "" },
  ];

  // Окно приветствия. Возвращает управление для тестов; onDone(mode) вызывается один раз.
  function showOnboarding(doc, opts) {
    const o = opts || {};
    if (!doc || !doc.body || doc.getElementById("onboard")) return null;
    const prevFocus = doc.activeElement;
    const el = doc.createElement("div");
    el.id = "onboard"; el.className = "onboard";
    el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "ob-title");
    doc.body.appendChild(el);
    doc.body.classList.add("ob-lock");
    let i = 0, done = false, x0 = null;
    const last = () => i === SLIDES.length - 1;
    const sfx = () => { try { root.FX && root.FX.play("tap"); } catch (e) { /* звук необязателен */ } };

    function finish(m) {
      if (done) return;
      done = true;
      finishOnboarding(m);
      doc.removeEventListener("keydown", onKey);
      if (el.parentNode) el.parentNode.removeChild(el);
      doc.body.classList.remove("ob-lock");
      try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) { /* элемента уже нет */ }
      if (o.onDone) o.onDone(m || mode());
    }
    function draw() {
      const s = SLIDES[i];
      const body = s.id === "mode"
        ? `<div class="ob-modes">
            <button type="button" class="ob-mode" data-pick="simple"><span class="em">🌱</span><b>Простой</b><small>Только нужное: план, тренировки, питание. Подсказки и первые шаги</small></button>
            <button type="button" class="ob-mode" data-pick="pro"><span class="em">⚡</span><b>Pro</b><small>Всё сразу: тренеры, тарифы, рейтинг, аналитика, идеи команды</small></button></div>`
        : `<div class="ob-art">${s.art}</div>`;
      el.innerHTML = `<div class="ob-card" key="${s.id}">
        <button type="button" class="ob-skip" data-skip>${last() ? "" : "Пропустить"}</button>
        ${body}
        <h2 id="ob-title">${s.title}</h2><p>${s.text}</p>
        <div class="ob-dots" aria-hidden="true">${SLIDES.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>
        <div class="ob-nav">${i > 0 ? `<button type="button" class="ghost" data-prev>Назад</button>` : "<span></span>"}${last() ? "" : `<button type="button" data-next>${i === SLIDES.length - 2 ? "Далее" : "Дальше"}</button>`}</div>
        <div class="ob-step" aria-live="polite">Шаг ${i + 1} из ${SLIDES.length}</div></div>`;
      const first = el.querySelector("[data-next],[data-pick]");
      if (first && first.focus) first.focus();
    }
    function go(d) { const n = i + d; if (n < 0 || n >= SLIDES.length) return; i = n; sfx(); draw(); }
    el.addEventListener("click", ev => {
      const t = ev.target.closest ? ev.target.closest("button") : null;
      if (!t) return;
      if (t.hasAttribute("data-next")) go(1);
      else if (t.hasAttribute("data-prev")) go(-1);
      else if (t.hasAttribute("data-skip")) { sfx(); finish("simple"); }
      else if (t.dataset.pick) { sfx(); try { root.FX && root.FX.confetti(); } catch (e) { /* без анимации */ } finish(t.dataset.pick); }
    });
    // Свайп на телефоне: влево — дальше, вправо — назад.
    el.addEventListener("touchstart", ev => { x0 = ev.touches && ev.touches[0] ? ev.touches[0].clientX : null; }, { passive: true });
    el.addEventListener("touchend", ev => {
      const t = ev.changedTouches && ev.changedTouches[0];
      if (x0 == null || !t) return;
      const dx = t.clientX - x0; x0 = null;
      if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
    }, { passive: true });
    function onKey(ev) {
      if (ev.key === "ArrowRight") go(1);
      else if (ev.key === "ArrowLeft") go(-1);
      else if (ev.key === "Escape") finish("simple");
      else if (ev.key === "Tab") { // фокус остаётся внутри окна
        const f = Array.from(el.querySelectorAll("button")).filter(b => b.textContent.trim() || b.dataset.pick);
        if (!f.length) return;
        const a = doc.activeElement, firstB = f[0], lastB = f[f.length - 1];
        if (ev.shiftKey && a === firstB) { ev.preventDefault(); lastB.focus(); }
        else if (!ev.shiftKey && a === lastB) { ev.preventDefault(); firstB.focus(); }
      }
    }
    doc.addEventListener("keydown", onKey);
    draw();
    return { go, finish, get index() { return i; }, get slides() { return SLIDES.length; } };
  }

  const api = { KEY, MODES, SLIDES, TIPS, mode, isPro, setMode, onMode, apply, steps, tip, dismissTip, resetTips, needsOnboarding, finishOnboarding, showOnboarding, hideSteps, stepsHidden, hideInstall, installHidden, read };
  root.Guide = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
