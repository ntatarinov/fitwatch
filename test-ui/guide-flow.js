// Сценарий для новичка в имитации браузера (jsdom): приветствие, режимы «Простой» и «Pro», первые шаги, подсказки, установка.
// Запуск: npm i --no-save jsdom && node test-ui/guide-flow.js. Это не настоящий браузер: анимации и вид на телефоне здесь не проверяются.
const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const ROOT = path.join(__dirname, "..");

function load(prefs) {
  let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => "<script>" + fs.readFileSync(path.join(ROOT, src), "utf8").replace(/<\/script>/g, "<\\/script>") + "</script>");
  const errors = [], vc = new VirtualConsole();
  vc.on("jsdomError", e => errors.push(String(e.stack || e).split("\n")[0])); vc.on("error", e => errors.push(String(e)));
  const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) {
    w.scrollTo = () => {}; w.HTMLCanvasElement.prototype.getContext = () => null;
    if (prefs) w.localStorage.setItem("fitwatch.ui", JSON.stringify(prefs));
  } });
  dom.window.confirm = () => true;
  return { w: dom.window, errors };
}
const tick = (ms = 5) => new Promise(r => setTimeout(r, ms));
const $ = (w, s) => w.document.querySelector(s), $$ = (w, s) => Array.from(w.document.querySelectorAll(s));
const text = (w, s) => ($(w, s) || { textContent: "" }).textContent;
const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const key = (w, k) => w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: k, bubbles: true }));
const go = async (w, h) => { w.location.hash = h; await tick(); };
const ui = w => JSON.parse(w.localStorage.getItem("fitwatch.ui") || "null");
let n = 0, failed = 0;
function ok(c, name) { n++; if (!c) { failed++; console.log("FAIL:", name); } else console.log("ok  :", name); }

(async () => {
  // 1. Первый заход: приветствие
  const { w, errors } = load(null);
  await tick(20);
  const ob = () => $(w, "#onboard");
  ok(!!ob() && ob().getAttribute("role") === "dialog" && ob().getAttribute("aria-modal") === "true", "приветствие открылось как диалог");
  ok(w.document.body.classList.contains("ob-lock"), "страница под окном не прокручивается");
  ok(/Добро пожаловать/.test(text(w, "#ob-title")) && /Шаг 1 из 4/.test(text(w, ".ob-step")), "первый слайд и номер шага");
  ok($$(w, ".ob-dots i").length === 4 && $$(w, ".ob-dots i.on").length === 1, "четыре точки, одна активна");
  click(w, $(w, "[data-next]"));
  ok(/Выбери цель/.test(text(w, "#ob-title")) && $$(w, ".ob-flow span").length === 4, "кнопка «Дальше» ведёт на второй слайд с анимацией шагов");
  key(w, "ArrowRight");
  ok(/Тренируйся/.test(text(w, "#ob-title")) && !!$(w, ".ob-ring .val"), "стрелка вправо открыла третий слайд с кольцом");
  key(w, "ArrowLeft");
  ok(/Выбери цель/.test(text(w, "#ob-title")), "стрелка влево вернула назад");
  click(w, $(w, "[data-next]")); click(w, $(w, "[data-next]"));
  ok(/Как тебе удобнее/.test(text(w, "#ob-title")) && $$(w, "[data-pick]").length === 2 && !$(w, "[data-next]"), "последний слайд: выбор режима");
  ok(ui(w) === null, "пока выбора нет, настройки не записаны");
  click(w, $(w, '[data-pick="simple"]'));
  await tick();
  ok(!ob() && !w.document.body.classList.contains("ob-lock"), "после выбора окно закрылось");
  ok(ui(w) && ui(w).onboarded === true && ui(w).mode === "simple", "выбор «Простой» и «приветствие показано» записаны");
  ok(w.document.body.dataset.mode === "simple" && /Простой/.test(text(w, "[data-modebtn]")), "режим виден на странице и в кнопке вверху");
  ok(!!$(w, '[data-t="rating"]') && $(w, '[data-t="rating"]').classList.contains("pro-only"), "вкладка «Рейтинг» помечена только для Pro");

  // 2. Главная в простом режиме
  await go(w, "#/");
  ok(!!$(w, "#stepscard") && $$(w, ".step-list li").length === 4, "на главной чек-лист «Первые шаги» из 4 пунктов");
  ok($$(w, ".step-list li.cur").length === 1 && /Подбери план/.test(text(w, ".step-list li.cur")) && $(w, ".step-list li.cur a").getAttribute("href") === "#/me", "текущий шаг один и ведёт к анкете");
  ok(/Выполнено 0 из 4/.test(text(w, "#stepscard")), "прогресс 0 из 4");
  ok(!$(w, 'a[href="#/ideas"]') && !/Идеи команды/.test(text(w, "main")), "в простом режиме нет идей команды");
  ok(!$(w, 'a[href="#/sleep"]') && !$(w, ".tiles"), "в простом режиме нет сна и плиток программ");
  ok(!!$(w, '.teaser [data-setmode="pro"]'), "есть карточка «Нужно больше? Включить Pro»");
  ok(!$(w, ".hero") && !!$(w, ".ring"), "пока нет плана, совета дня нет (ведёт чек-лист), кольцо недели есть");

  // 3. Тренировки в простом режиме
  await go(w, "#/programs");
  ok(!$(w, 'a[href="#/trainers"]') && !$(w, 'a[href="#/premium"]') && !$(w, 'a[href="#/trainer"]'), "в простом режиме нет тренеров, расширенных программ и чата по правилам");
  ok(!!$(w, 'a[href="#/library"]') && !!$(w, 'a[href="#/me"]') && $$(w, 'a[href^="#/p/"]').length >= 3, "остались план, каталог и готовые программы");

  // 4. Подсказки и их скрытие
  await go(w, "#/library");
  ok(!!$(w, '.tip[data-tip="library"]') && /Нажми на мышцу/.test(text(w, ".tip")), "в каталоге есть подсказка про мышцы");
  click(w, $(w, "[data-tip-x]"));
  await tick(260);
  ok(!$(w, ".tip"), "после «Понятно» подсказка исчезла");
  ok(ui(w).tips.library === true, "это запомнено");
  await go(w, "#/food");
  ok(!!$(w, '.tip[data-tip="food"]'), "в питании своя подсказка");

  // 5. Первые шаги двигаются вместе с делами пользователя
  await go(w, "#/me");
  const f = $(w, "#meform");
  const set = (nm, v) => { f.querySelector(`input[name="${nm}"][value="${v}"]`).checked = true; };
  set("goal", "lose"); set("level", "1"); set("days", "3"); set("minutes", "30"); set("place", "home");
  set("sex", "f"); f.elements.age.value = "28"; f.elements.height.value = "165"; f.elements.weight.value = "62"; f.elements.name.value = "Новичок";
  f.dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true }));
  await tick(20);
  await go(w, "#/");
  ok(!!$(w, ".hero"), "когда план есть, на главной появился совет дня");
  ok(/Выполнено 1 из 4/.test(text(w, "#stepscard")) && $$(w, ".step-list li.done").length === 1 && /тренировку/.test(text(w, ".step-list li.cur")), "после плана выполнено 1 из 4, дальше первая тренировка");
  ok(/^#\/pd\//.test($(w, ".step-list li.cur a").getAttribute("href")), "шаг «тренировка» ведёт на первый день плана");
  await go(w, $(w, ".step-list li.cur a").getAttribute("href"));
  click(w, $(w, "#done"));
  await tick(20);
  await go(w, "#/");
  ok(/Выполнено 2 из 4/.test(text(w, "#stepscard")), "после тренировки выполнено 2 из 4");
  await go(w, "#/food");
  click(w, $(w, "[data-quick]"));
  await tick(20);
  await go(w, "#/");
  ok(/Выполнено 3 из 4/.test(text(w, "#stepscard")) && /Сохрани прогресс/.test(text(w, ".step-list li.cur")), "после записи еды выполнено 3 из 4, остался вход в аккаунт");
  click(w, $(w, "[data-steps-x]"));
  ok(!$(w, "#stepscard") && ui(w).stepsHidden === true, "чек-лист можно скрыть, и это запомнится");
  await go(w, "#/"); ok(!$(w, "#stepscard"), "после перехода чек-лист не вернулся");

  // 6. Режим Pro
  click(w, $(w, '.teaser [data-setmode="pro"]'));
  await tick(20);
  ok(w.document.body.dataset.mode === "pro" && ui(w).mode === "pro" && /Pro/.test(text(w, "[data-modebtn]")), "Pro включён и записан");
  ok(!!$(w, 'a[href="#/ideas"]') && !!$(w, 'a[href="#/sleep"]') && !!$(w, ".tiles"), "в Pro на главной всё на месте: идеи, сон, программы");
  ok(!$(w, "#stepscard") && !$(w, ".teaser"), "в Pro нет первых шагов и приглашения в Pro");
  ok(/Pro/.test(text(w, ".toasts")), "о смене режима сказало всплывающее сообщение");
  await go(w, "#/programs");
  ok(!!$(w, 'a[href="#/trainers"]') && !!$(w, 'a[href="#/premium"]') && !!$(w, 'a[href="#/trainer"]'), "в Pro на странице тренировок есть тренеры, расширенные программы и чат");
  await go(w, "#/food");
  ok(!$(w, ".tip"), "в Pro подсказок нет");
  await go(w, "#/profile");
  ok(!!$(w, "#rep") && !!$(w, "#demo") && /Изучена техника/.test(text(w, "main")), "в Pro в профиле есть выгрузка и демо");

  // 7. Переключение кнопкой в шапке и из профиля
  click(w, $(w, "[data-modebtn]"));
  await tick(20);
  ok(w.document.body.dataset.mode === "simple" && !$(w, "#rep") && !$(w, "#demo"), "кнопка в шапке вернула простой режим, в профиле нет выгрузки и демо");
  ok(!!$(w, "#saveName") && !!$(w, "#name"), "в простом профиле имя можно менять");
  click(w, $(w, '.mode-opt[data-setmode="pro"]'));
  await tick(20);
  ok(w.document.body.dataset.mode === "pro" && $(w, '.mode-opt[data-setmode="pro"]').classList.contains("on"), "переключатель в профиле тоже работает");

  // 8. Страница «Как пользоваться»
  await go(w, "#/guide");
  ok(/Как пользоваться/.test(text(w, "h1")) && $$(w, ".faq").length >= 6 && $$(w, ".map").length === 5, "страница гайда: вопросы и карта разделов (в Pro пять вкладок)");
  ok(!!$(w, "#stepscard") && !$(w, "[data-steps-x]"), "на странице гайда первые шаги видны всегда, без кнопки «Скрыть»");
  click(w, $(w, '.mode-opt[data-setmode="simple"]')); await tick(20);
  ok($$(w, ".map").length === 4, "в простом режиме в карте разделов четыре пункта, без рейтинга");
  click(w, $(w, "[data-replay]"));
  ok(!!$(w, "#onboard"), "«Показать приветствие ещё раз» открывает его снова");
  key(w, "Escape");
  await tick();
  ok(!$(w, "#onboard"), "Esc закрывает приветствие");
  click(w, $(w, "[data-tips-reset]"));
  await go(w, "#/library");
  ok(!!$(w, '.tip[data-tip="library"]'), "«Вернуть подсказки» вернула скрытую подсказку");

  // 9. Установка как приложение (iPhone: инструкция, Chrome: кнопка)
  await go(w, "#/profile");
  ok(!$(w, "#installcard"), "в jsdom установка недоступна, карточки нет (как в обычном настольном браузере без поддержки)");
  const ev = new w.Event("beforeinstallprompt", { cancelable: true });
  let prompted = false; ev.prompt = () => { prompted = true; }; ev.userChoice = Promise.resolve({ outcome: "accepted" });
  w.dispatchEvent(ev);
  await tick(10);
  ok(!!$(w, "#installcard [data-install]"), "когда браузер разрешил установку, в профиле появилась кнопка «Установить»");
  await go(w, "#/");
  ok(!!$(w, "#installcard [data-install-x]"), "на главной карточка установки с «Не сейчас»");
  click(w, $(w, "[data-install-x]"));
  ok(!$(w, "#installcard") && ui(w).installHidden === true, "«Не сейчас» скрывает карточку с главной");
  await go(w, "#/profile");
  click(w, $(w, "#installcard [data-install]"));
  await tick(20);
  ok(prompted, "кнопка «Установить» показала системное окно браузера");

  // 10. Существующий пользователь с настройками не видит приветствия
  const second = load({ mode: "pro", onboarded: true });
  await tick(20);
  ok(!$(second.w, "#onboard") && second.w.document.body.dataset.mode === "pro", "при повторном заходе приветствия нет, режим сохранён");

  // 11. Пропуск приветствия
  const third = load(null);
  await tick(20);
  click(third.w, $(third.w, "[data-skip]"));
  ok(!$(third.w, "#onboard") && ui(third.w).onboarded === true && ui(third.w).mode === "simple", "«Пропустить» закрывает окно и оставляет простой режим");

  ok(errors.length === 0 && second.errors.length === 0 && third.errors.length === 0, "ошибок в консоли нет " + errors.concat(second.errors, third.errors).join("; "));
  console.log(`\nпроверок: ${n}, не прошло: ${failed}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
