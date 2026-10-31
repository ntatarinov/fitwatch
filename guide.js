// Настройка под себя: режим Lite или Pro, что человеку важно (разделы), тема, приветствие, первые шаги и подсказки.
// Настройки лежат отдельно от прогресса (ключ fitwatch.ui), поэтому «Сбросить прогресс» их не стирает.
// Без хранилища (приватный режим) всё работает в памяти до закрытия страницы.
(function (root) {
  "use strict";
  const KEY = "fitwatch.ui";
  const MODES = ["lite", "pro"];
  const THEMES = ["auto", "light", "dark"];
  let memory = null;

  // Разделы, которые человек включает и выключает. Тренировки есть всегда.
  const MODULES = [
    { id: "food", icon: "food", title: "Питание", hint: "Калории и БЖУ за день" },
    { id: "sleep", icon: "moon", title: "Сон и восстановление", hint: "Журнал сна и советы по отдыху" },
    { id: "progress", icon: "scale", title: "Вес и рост", hint: "История замеров и график" },
    { id: "rating", icon: "trophy", title: "Рейтинг и соревнования", hint: "Баллы среди других участников" },
    { id: "trainers", icon: "chat", title: "Тренер и подписки", hint: "Чат с тренером, программы по подписке" },
  ];
  const MODULE_IDS = MODULES.map(m => m.id);
  const LITE_DEFAULT = ["food"];

  const defaults = () => ({ mode: "lite", onboarded: false, tips: {}, stepsHidden: false, installHidden: false, modules: null, theme: "auto", welcomeOff: false });
  const cleanModules = m => (Array.isArray(m) ? MODULE_IDS.filter(id => m.includes(id)) : null);
  function read() {
    let raw = null;
    try { raw = root.localStorage.getItem(KEY); } catch (e) { return memory ? Object.assign(defaults(), memory) : defaults(); }
    let p = {};
    try { p = JSON.parse(raw) || {}; } catch (e) { p = {}; }
    if (typeof p !== "object" || Array.isArray(p)) p = {};
    const mode = p.mode === "simple" ? "lite" : p.mode; // прежнее название режима
    return {
      mode: MODES.includes(mode) ? mode : "lite",
      onboarded: p.onboarded === true,
      tips: p.tips && typeof p.tips === "object" && !Array.isArray(p.tips) ? p.tips : {},
      stepsHidden: p.stepsHidden === true,
      installHidden: p.installHidden === true,
      modules: cleanModules(p.modules),
      theme: THEMES.includes(p.theme) ? p.theme : "auto",
      welcomeOff: p.welcomeOff === true,
    };
  }
  function write(p) {
    memory = p;
    try { root.localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* без хранилища настройки живут до перезагрузки */ }
  }
  const patch = f => { const p = read(); f(p); write(p); return p; };

  // ---------- подписки на изменения ----------
  const modeListeners = [], prefListeners = [];
  const onMode = f => { modeListeners.push(f); };
  const onPrefs = f => { prefListeners.push(f); };
  const fire = (list, arg) => list.slice().forEach(f => { try { f(arg); } catch (e) { /* подписчик не должен ломать переключение */ } });

  // ---------- режим ----------
  const mode = () => read().mode;
  const isPro = () => mode() === "pro";
  function setMode(m) {
    if (!MODES.includes(m)) return false;
    const was = mode();
    patch(p => { p.mode = m; });
    apply();
    if (was !== m) { fire(modeListeners, m); fire(prefListeners, "mode"); }
    return true;
  }

  // ---------- разделы ----------
  // Пока человек сам не выбирал: в Lite только питание, в Pro всё (так было до настроек).
  function modules() {
    const p = read();
    return p.modules || (p.mode === "pro" ? MODULE_IDS.slice() : LITE_DEFAULT.slice());
  }
  const show = id => modules().includes(id);
  function setModules(list) {
    const m = cleanModules(list);
    if (!m) return false;
    patch(p => { p.modules = m; });
    apply();
    fire(prefListeners, "modules");
    return true;
  }
  function toggleModule(id, on) {
    if (!MODULE_IDS.includes(id)) return false;
    const cur = new Set(modules());
    if (on === undefined ? !cur.has(id) : on) cur.add(id); else cur.delete(id);
    return setModules([...cur]);
  }

  // ---------- тема ----------
  const theme = () => read().theme;
  function setTheme(t) {
    if (!THEMES.includes(t)) return false;
    patch(p => { p.theme = t; });
    apply();
    fire(prefListeners, "theme");
    return true;
  }

  // Состояние живёт на <html> и <body>: стили скрывают разделы, которые человек отключил, и выбирают тему.
  function apply() {
    const doc = root.document;
    if (!doc || !doc.body) return;
    const p = read(), hidden = MODULE_IDS.filter(id => !modules().includes(id));
    doc.body.dataset.mode = p.mode;
    doc.body.dataset.hide = hidden.join(" ");
    if (doc.documentElement) {
      if (p.theme === "auto") delete doc.documentElement.dataset.theme; else doc.documentElement.dataset.theme = p.theme;
    }
    // Цвет строки браузера и системной панели: при теме «как в системе» — по системе, при выбранной вручную — по ней.
    doc.querySelectorAll('meta[name="theme-color"]').forEach(m => {
      if (!m.dataset.media) m.dataset.media = m.getAttribute("media") || "";
      const dark = /dark/.test(m.dataset.media);
      if (p.theme === "auto") m.setAttribute("media", m.dataset.media);
      else m.setAttribute("media", (p.theme === "dark") === dark ? "all" : "not all");
    });
    doc.querySelectorAll("[data-modebtn]").forEach(b => { b.textContent = p.mode === "pro" ? "Pro" : "Lite"; b.setAttribute("aria-label", "Режим " + (p.mode === "pro" ? "Pro" : "Lite") + ". Нажми, чтобы переключить"); });
  }

  // ---------- приветствие при заходе ----------
  // Показывается при каждом заходе, пока человек не вошёл в аккаунт. Отключить можно в настройках профиля.
  const welcomeEnabled = () => !read().welcomeOff;
  function setWelcome(on) {
    patch(p => { p.welcomeOff = !on; });
    fire(prefListeners, "welcome");
    return true;
  }
  const shouldWelcome = loggedIn => !loggedIn && welcomeEnabled();

  // ---------- первые шаги ----------
  // ctx: { hasPlan, workouts, foodEntries, loggedIn, nextHref, useFood }. Шаг про еду пропускается, если питание отключено.
  function steps(ctx) {
    const c = ctx || {};
    const list = [
      { id: "plan", icon: "target", title: "Подбери план", hint: "Ответь на пару вопросов, и получишь тренировки под себя", href: "#/me", done: !!c.hasPlan },
      { id: "workout", icon: "dumbbell", title: "Сделай первую тренировку", hint: "Открой день плана и нажми «Тренировка сделана»", href: c.nextHref || "#/programs", done: (c.workouts || 0) > 0 },
      { id: "food", icon: "food", title: "Запиши еду", hint: "Выбери продукт и граммы: калории и БЖУ посчитаются сами", href: "#/food", done: (c.foodEntries || 0) > 0 },
      { id: "account", icon: "cloud", title: "Сохрани прогресс", hint: "Войди через Telegram или почту: тренировки, вес и баллы сохранятся на сервере", href: "#/account", done: !!c.loggedIn },
    ].filter(s => (s.id !== "food" || c.useFood !== false) && (s.id !== "account" || c.canLogin !== false));
    const done = list.filter(s => s.done).length;
    const current = list.find(s => !s.done) || null;
    return { list, done, total: list.length, pct: Math.round(done / list.length * 100), current, complete: done === list.length };
  }

  // ---------- подсказки на страницах ----------
  const TIPS = {
    me: ["target", "Ответь честно про ограничения: программа уберёт упражнения, которые тебе не подходят."],
    plan: ["calendar", "Открой день плана и нажми «Тренировка сделана»: за каждый день баллы, а серия растёт."],
    library: ["dumbbell", "Нажми на мышцу на схеме тела, и останутся упражнения именно для неё."],
    food: ["food", "Выбери продукт и граммы: калории и БЖУ посчитаются сами. Массу в записи можно поправить."],
    sleep: ["moon", "Записывай сон по утрам. Если спал меньше 6 часов, совет дня предложит лёгкий день."],
    rating: ["trophy", "В рейтинге видны только те, кто сам согласился. Свой доступ включается в Профиле, в разделе «Аккаунт»."],
    trainers: ["chat", "Запрос тренеру доступен с тарифом «Персональный тренер». Тренер видит твои данные только с твоего согласия."],
    premium: ["diamond", "Расширенные программы рассчитаны на 4–8 недель. Открыть их можно по подписке или промокоду."],
  };
  const known = id => Object.prototype.hasOwnProperty.call(TIPS, id);
  const tipSeen = id => Object.prototype.hasOwnProperty.call(read().tips, id);
  const icon = n => (root.Icons ? root.Icons.svg(n, 20) : "");
  // Подсказки нужны новичку: в режиме Pro они скрыты.
  function tip(id) {
    if (!known(id) || isPro() || tipSeen(id)) return "";
    const t = TIPS[id];
    return `<div class="tip" data-tip="${id}" role="note"><span class="tip-ic" aria-hidden="true">${icon(t[0])}</span><p>${t[1]}</p><button type="button" class="tip-x" data-tip-x="${id}">Понятно</button></div>`;
  }
  function dismissTip(id) { if (known(id)) patch(p => { p.tips[id] = true; }); }
  function resetTips() { patch(p => { p.tips = {}; p.stepsHidden = false; p.installHidden = false; }); }

  // ---------- приветствие ----------
  const needsOnboarding = () => !read().onboarded;
  // modules: список выбранных разделов или не задан (останутся значения по режиму).
  function finishOnboarding(m, mods) {
    patch(p => { p.onboarded = true; });
    if (mods !== undefined) setModules(mods);
    if (m) setMode(m);
  }
  const hideSteps = () => patch(p => { p.stepsHidden = true; });
  const stepsHidden = () => read().stepsHidden;
  const hideInstall = () => patch(p => { p.installHidden = true; });
  const installHidden = () => read().installHidden;

  const SLIDES = [
    { id: "hello", title: "Добро пожаловать в FitWatch", text: "Тренировки с видео, питание и мотивация в одном месте. Покажу за минуту, как всё устроено.",
      art: `<div class="ob-orb"><span class="ob-float f1">${icon("dumbbell")}</span><span class="ob-float f2">${icon("food")}</span><span class="ob-float f3">${icon("flame")}</span><span class="ob-float f4">${icon("trophy")}</span><b class="ob-logo">FW</b></div>` },
    { id: "goal", title: "Выбери цель, получи план", text: "Ответишь на несколько вопросов о цели, уровне и ограничениях. Приложение соберёт неделю тренировок именно под тебя.",
      art: `<div class="ob-flow"><span style="--i:0">Цель</span><span style="--i:1">Уровень</span><span style="--i:2">Дни и время</span><span style="--i:3" class="ok">План готов</span></div>` },
    { id: "train", title: "Тренируйся и отмечай", text: "За каждую тренировку баллы, серия дней и новые уровни. Видео покажет технику, а лёгкий день не сломает серию.",
      art: `<div class="ob-ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="trk" cx="50" cy="50" r="42" fill="none" stroke-width="9"/><circle class="val" cx="50" cy="50" r="42" fill="none" stroke-width="9" stroke-dasharray="264" stroke-linecap="round"/></svg><div class="ob-num"><b>+20</b><small>баллов</small></div><span class="ob-flame">${icon("flame")}</span></div>` },
    { id: "interests", title: "Что тебе важно?", text: "Отметь, что нужно. Остальное спрячем, чтобы не мешало. Вернуть можно в Профиле.", art: "" },
    { id: "mode", title: "Как показывать?", text: "Режим можно сменить в любой момент кнопкой вверху.", art: "" },
  ];

  // Слайд «Установи как приложение»: есть только там, где установку можно предложить (кнопка в Chrome и Android, инструкция на iPhone).
  function installSlide(status) {
    const ios = status === "ios";
    return { id: "install", title: "Установи как приложение", status,
      text: ios ? "Нажми «Поделиться» (в Safari значок внизу экрана, в Chrome справа в адресной строке) и выбери «На экран Домой». Открывай сайт в браузере, не внутри Telegram или Instagram."
        : "Откроется с экрана телефона как обычное приложение: без адресной строки, быстрее и даже без сети.",
      art: `<div class="ob-app"><img src="/icons/icon-192.png" alt="" width="104" height="104"><span class="ob-dl">${icon(ios ? "share" : "download")}</span></div>` };
  }
  // Список слайдов зависит от того, можно ли сейчас предложить установку: второй слайд появляется, когда браузер это разрешил.
  const slidesFor = pwaStatus => (pwaStatus === "prompt" || pwaStatus === "ios" ? [SLIDES[0], installSlide(pwaStatus)].concat(SLIDES.slice(1)) : SLIDES.slice());

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
    // Всё под окном недоступно для фокуса и экранного диктора, пока окно открыто.
    const behind = Array.from(doc.body.children).filter(n => n !== el && !n.inert);
    behind.forEach(n => { n.inert = true; n.setAttribute("aria-hidden", "true"); });
    const again = read().onboarded; // повторное приветствие: стоят текущие настройки, а «Пропустить» и Esc их не меняют
    const picked = new Set(again ? modules() : ["food"]); // впервые: питание отмечено заранее
    let i = 0, done = false, x0 = null, curId = "hello";
    const list = () => slidesFor(root.Pwa ? root.Pwa.status() : "none");
    const last = () => i === list().length - 1;
    const sfx = () => { try { root.FX && root.FX.play("tap"); } catch (e) { /* звук необязателен */ } };

    function finish(m, mods) {
      if (done) return;
      done = true;
      finishOnboarding(m, mods);
      doc.removeEventListener("keydown", onKey);
      behind.forEach(n => { n.inert = false; n.removeAttribute("aria-hidden"); });
      if (el.parentNode) el.parentNode.removeChild(el);
      doc.body.classList.remove("ob-lock");
      try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) { /* элемента уже нет */ }
      if (o.onDone) o.onDone(m || mode());
    }
    const interestsHtml = () => `<div class="ob-list" role="group" aria-label="Что тебе важно">
      <div class="ob-opt on locked" aria-disabled="true"><span class="oi">${icon("dumbbell")}</span><span class="ot"><b>Тренировки</b><small>Планы, упражнения с видео: всегда на месте</small></span><span class="ck">${icon("check")}</span></div>
      ${MODULES.map(m => `<button type="button" class="ob-opt ${picked.has(m.id) ? "on" : ""}" data-interest="${m.id}" role="checkbox" aria-checked="${picked.has(m.id)}"><span class="oi">${icon(m.icon)}</span><span class="ot"><b>${m.title}</b><small>${m.hint}</small></span><span class="ck">${icon("check")}</span></button>`).join("")}</div>`;
    const modeHtml = () => `<div class="ob-modes">
      <button type="button" class="ob-mode" data-pick="lite"><span class="oi">${icon("leaf")}</span><span class="ot"><b>Lite</b><small>Только нужное. Подсказки на страницах и первые шаги</small></span></button>
      <button type="button" class="ob-mode" data-pick="pro"><span class="oi">${icon("bolt")}</span><span class="ot"><b>Pro</b><small>Без подсказок, больше данных: аналитика, выгрузка, идеи команды. Это не платный тариф</small></span></button></div>`;
    function draw() {
      const L = list();
      const at = L.findIndex(x => x.id === curId);
      i = at >= 0 ? at : Math.min(i, L.length - 1);   // список мог измениться (появилась установка): остаёмся на том же слайде
      const s = L[i];
      curId = s.id;
      const body = s.id === "interests" ? interestsHtml() : s.id === "mode" ? modeHtml() : `<div class="ob-art">${s.art}</div>`;
      const installBtn = s.id === "install" && s.status === "prompt" ? `<button type="button" class="ob-install" data-install-now>Установить</button>` : "";
      el.innerHTML = `<div class="ob-card" key="${s.id}">
        ${last() ? "" : `<button type="button" class="ob-skip" data-skip>Пропустить</button>`}
        ${body}
        <h2 id="ob-title">${s.title}</h2><p>${s.text}</p>${installBtn}
        <div class="ob-dots" aria-hidden="true">${L.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>
        <div class="ob-nav">${i > 0 ? `<button type="button" class="ghost" data-prev>Назад</button>` : "<span></span>"}${last() ? "" : `<button type="button" data-next>Дальше</button>`}</div>
        <div class="ob-step" aria-live="polite">Шаг ${i + 1} из ${L.length}</div>
        <button type="button" class="ob-login" data-login>Уже есть аккаунт? Войти</button></div>`;
      const first = el.querySelector("[data-next],[data-pick]");
      if (first && first.focus) first.focus();
    }
    function go(d) { const n = i + d, L = list(); if (n < 0 || n >= L.length) return; i = n; curId = L[n].id; sfx(); draw(); }
    el.addEventListener("click", ev => {
      const t = ev.target.closest ? ev.target.closest("button") : null;
      if (!t) return;
      if (t.hasAttribute("data-next")) go(1);
      else if (t.hasAttribute("data-prev")) go(-1);
      else if (t.hasAttribute("data-skip")) { sfx(); finish(again ? undefined : "lite"); }
      else if (t.hasAttribute("data-login")) { sfx(); finish(again ? undefined : "lite"); try { root.location.hash = "#/account"; } catch (e) { /* без адреса просто закрываем */ } }
      else if (t.hasAttribute("data-install-now")) {
        sfx();
        // После показа окна установки слайд исчезает из списка (предлагать больше нечего): следующий запоминаем заранее.
        const L0 = list(), nextId = (L0[i + 1] || L0[i]).id;
        Promise.resolve(root.Pwa && root.Pwa.install()).then(() => { if (!done) { curId = nextId; draw(); } });
      } else if (t.dataset.interest) {
        const id = t.dataset.interest, on = !picked.has(id);
        if (on) picked.add(id); else picked.delete(id);
        t.classList.toggle("on", on); t.setAttribute("aria-checked", String(on));
        sfx();
      } else if (t.dataset.pick) { sfx(); try { root.FX && root.FX.confetti(); } catch (e) { /* без анимации */ } finish(t.dataset.pick, [...picked]); }
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
      else if (ev.key === "Escape") finish(again ? undefined : "lite");
      else if (ev.key === "Tab") { // фокус остаётся внутри окна
        const f = Array.from(el.querySelectorAll("button")).filter(b => b.textContent.trim() || b.dataset.pick || b.dataset.interest);
        if (!f.length) return;
        const a = doc.activeElement, firstB = f[0], lastB = f[f.length - 1];
        if (!el.contains(a)) { ev.preventDefault(); firstB.focus(); }
        else if (ev.shiftKey && a === firstB) { ev.preventDefault(); lastB.focus(); }
        else if (!ev.shiftKey && a === lastB) { ev.preventDefault(); firstB.focus(); }
      }
    }
    doc.addEventListener("keydown", onKey);
    draw();
    return { go, finish, get index() { return i; }, get slides() { return list().length; }, get picked() { return [...picked]; } };
  }

  const api = { KEY, MODES, THEMES, MODULES, MODULE_IDS, LITE_DEFAULT, SLIDES, slidesFor, TIPS, mode, isPro, setMode, onMode, onPrefs, modules, show, setModules, toggleModule, theme, setTheme, welcomeEnabled, setWelcome, shouldWelcome, apply, steps, tip, dismissTip, resetTips, needsOnboarding, finishOnboarding, showOnboarding, hideSteps, stepsHidden, hideInstall, installHidden, read };
  root.Guide = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
