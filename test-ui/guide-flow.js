// Сценарий для новичка в имитации браузера (jsdom): приветствие с выбором важного, режимы Lite и Pro, настройки в профиле,
// первые шаги, подсказки, тема, установка. Запуск: npm i --no-save jsdom && node test-ui/guide-flow.js.
// Это не настоящий браузер: анимации, цвета и вид на телефоне здесь не проверяются.
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
  ok(/Добро пожаловать/.test(text(w, "#ob-title")) && /Шаг 1 из 5/.test(text(w, ".ob-step")), "первый слайд и номер шага из пяти");
  ok($$(w, ".ob-dots i").length === 5 && $$(w, ".ob-dots i.on").length === 1, "пять точек, одна активна");
  click(w, $(w, "[data-next]"));
  ok(/Выбери цель/.test(text(w, "#ob-title")) && $$(w, ".ob-flow span").length === 4, "второй слайд с анимацией шагов");
  key(w, "ArrowRight");
  ok(/Тренируйся/.test(text(w, "#ob-title")) && !!$(w, ".ob-ring .val"), "стрелка вправо открыла третий слайд с кольцом");
  key(w, "ArrowLeft");
  ok(/Выбери цель/.test(text(w, "#ob-title")), "стрелка влево вернула назад");
  click(w, $(w, "[data-next]")); click(w, $(w, "[data-next]"));
  ok(/Что тебе важно/.test(text(w, "#ob-title")), "четвёртый слайд спрашивает, что важно");
  ok($$(w, "[data-interest]").length === 5 && $$(w, ".ob-opt.locked").length === 1 && /Тренировки/.test(text(w, ".ob-opt.locked")), "пять выбираемых разделов и закреплённые «Тренировки»");
  const state = id => $(w, `[data-interest="${id}"]`).getAttribute("aria-checked");
  ok(state("food") === "true" && state("sleep") === "false" && state("rating") === "false", "питание отмечено заранее, остальное нет");
  click(w, $(w, '[data-interest="sleep"]')); click(w, $(w, '[data-interest="rating"]'));
  ok(state("sleep") === "true" && state("rating") === "true" && $(w, '[data-interest="sleep"]').classList.contains("on"), "разделы отмечаются кликом");
  click(w, $(w, '[data-interest="rating"]'));
  ok(state("rating") === "false", "повторный клик снимает отметку");
  ok(ui(w) === null, "пока выбора нет, настройки не записаны");
  click(w, $(w, "[data-next]"));
  ok(/Как показывать/.test(text(w, "#ob-title")) && $$(w, "[data-pick]").length === 2 && !$(w, "[data-next]"), "последний слайд: Lite или Pro");
  ok(/Lite/.test(text(w, '[data-pick="lite"]')) && /Pro/.test(text(w, '[data-pick="pro"]')), "режимы названы Lite и Pro");
  click(w, $(w, '[data-pick="lite"]'));
  await tick();
  ok(!ob() && !w.document.body.classList.contains("ob-lock"), "после выбора окно закрылось");
  ok(ui(w) && ui(w).onboarded === true && ui(w).mode === "lite" && JSON.stringify(ui(w).modules) === JSON.stringify(["food", "sleep"]), "режим Lite и разделы «питание, сон» записаны");
  ok(w.document.body.dataset.mode === "lite" && /Lite/.test(text(w, "[data-modebtn]")), "режим виден на странице и в кнопке вверху");
  ok(w.document.body.dataset.hide === "progress rating trainers", "скрытые разделы отмечены на странице: " + w.document.body.dataset.hide);
  ok(!!$(w, '[data-t="rating"]') && $(w, '[data-t="rating"]').dataset.mod === "rating" && $(w, '[data-t="food"]').dataset.mod === "food", "вкладки «Рейтинг» и «Питание» привязаны к своим разделам");
  ok($$(w, "#tabbar svg").length === 5, "у вкладок линейные значки, не эмодзи");

  // 2. Главная в Lite
  await go(w, "#/");
  ok(!!$(w, "#stepscard") && $$(w, ".step-list li").length === 4, "на главной чек-лист «Первые шаги» из 4 пунктов");
  ok($$(w, ".step-list li.cur").length === 1 && /Подбери план/.test(text(w, ".step-list li.cur")) && $(w, ".step-list li.cur a").getAttribute("href") === "#/me", "текущий шаг один и ведёт к анкете");
  ok(!$(w, ".hero") && !!$(w, ".ring"), "пока нет плана, совета дня нет (ведёт чек-лист), кольцо недели есть");
  ok(!!$(w, "a.nutri") && /Питание сегодня/.test(text(w, "a.nutri")) && /0/.test(text(w, "a.nutri .num")), "питание включено: на главной карточка «Питание сегодня»");
  ok(!!$(w, 'a.card[href="#/sleep"]'), "сон включён: есть карточка сна");
  ok(!$(w, 'a[href="#/body"]'), "вес и рост выключены: карточки нет");
  ok(!$(w, 'a[href="#/ideas"]') && !$(w, ".tiles"), "в Lite нет идей команды и плиток программ");
  ok(!!$(w, '.teaser [data-setmode="pro"]'), "есть карточка «Включить Pro»");

  // 3. Тренировки в Lite
  await go(w, "#/programs");
  ok(!$(w, 'a[href="#/trainers"]') && !$(w, 'a[href="#/premium"]') && !$(w, 'a[href="#/trainer"]'), "тренеры выключены: нет тренеров, расширенных программ и чата по правилам");
  ok(!!$(w, 'a[href="#/library"]') && !!$(w, 'a[href="#/me"]') && $$(w, 'a[href^="#/p/"]').length >= 3, "остались план, каталог и готовые программы");
  ok($$(w, "main .oi svg").length >= 2, "в списке значки, не эмодзи");

  // 4. Подсказки
  await go(w, "#/library");
  ok(!!$(w, '.tip[data-tip="library"]') && /Нажми на мышцу/.test(text(w, ".tip")) && !!$(w, ".tip svg"), "в каталоге подсказка со значком");
  click(w, $(w, "[data-tip-x]"));
  await tick(260);
  ok(!$(w, ".tip") && ui(w).tips.library === true, "после «Понятно» подсказка исчезла и это запомнено");
  await go(w, "#/food");
  ok(!!$(w, '.tip[data-tip="food"]'), "в питании своя подсказка");

  // 5. Первые шаги двигаются вместе с делами
  await go(w, "#/me");
  const f = $(w, "#meform");
  const set = (nm, v) => { f.querySelector(`input[name="${nm}"][value="${v}"]`).checked = true; };
  set("goal", "lose"); set("level", "1"); set("days", "3"); set("minutes", "30"); set("place", "home");
  set("sex", "f"); f.elements.age.value = "28"; f.elements.height.value = "165"; f.elements.weight.value = "62"; f.elements.name.value = "Новичок";
  f.dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true }));
  await tick(20);
  await go(w, "#/");
  ok(!!$(w, ".hero"), "когда план есть, на главной появился совет дня");
  ok(/Выполнено 1 из 4/.test(text(w, "#stepscard")) && $$(w, ".step-list li.done").length === 1 && /тренировку/.test(text(w, ".step-list li.cur")), "после плана выполнено 1 из 4");
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
  ok(/Выполнено 3 из 4/.test(text(w, "#stepscard")) && /Сохрани прогресс/.test(text(w, ".step-list li.cur")), "после записи еды выполнено 3 из 4");
  ok(+text(w, "a.nutri .num") > 0 && /1 запись/.test(text(w, "a.nutri")) && /Осталось/.test(text(w, "a.nutri")), "карточка питания показала съеденное и сколько осталось");
  click(w, $(w, "[data-steps-x]"));
  ok(!$(w, "#stepscard") && ui(w).stepsHidden === true, "чек-лист можно скрыть, и это запомнится");

  // 6. Настройки в профиле
  await go(w, "#/profile");
  ok(!!$(w, "#settings") && /Настройки приложения/.test(text(w, "#settings")), "в профиле есть настройки приложения");
  ok($$(w, "#settings [data-setmode]").length === 2 && /Lite/.test(text(w, "#settings")) && /Pro/.test(text(w, "#settings")), "в настройках режимы Lite и Pro");
  ok($$(w, "#settings [data-mod-toggle]").length === 5 && $$(w, "#settings .opt-row.locked").length === 1, "пять переключателей разделов и закреплённые тренировки");
  ok($(w, '[data-mod-toggle="food"]').getAttribute("aria-checked") === "true" && $(w, '[data-mod-toggle="trainers"]').getAttribute("aria-checked") === "false", "переключатели показывают текущий выбор");
  ok(!$(w, "#rep") && !$(w, "#demo"), "в Lite в профиле нет выгрузки и демо");
  click(w, $(w, '[data-mod-toggle="trainers"]'));
  await tick(20);
  ok(ui(w).modules.includes("trainers") && $(w, '[data-mod-toggle="trainers"]').getAttribute("aria-checked") === "true", "включили «Тренер и подписки»: записано, переключатель обновился");
  ok(!w.document.body.dataset.hide.includes("trainers"), "раздел больше не скрыт на странице");
  await go(w, "#/programs");
  ok(!!$(w, 'a[href="#/trainers"]') && !!$(w, 'a[href="#/premium"]'), "после включения на странице тренировок появились тренеры и расширенные программы");
  await go(w, "#/profile");
  click(w, $(w, '[data-mod-toggle="food"]'));
  await tick(20);
  ok(!ui(w).modules.includes("food") && w.document.body.dataset.hide.includes("food"), "выключили питание: записано и спрятано");
  await go(w, "#/");
  ok(!$(w, "a.nutri"), "карточки питания на главной больше нет");
  await go(w, "#/profile");
  click(w, $(w, '[data-mod-toggle="food"]')); await tick(20);
  // тема
  click(w, $(w, '[data-theme="dark"]')); await tick(10);
  ok(w.document.documentElement.dataset.theme === "dark" && ui(w).theme === "dark", "тема «Тёмная» применена и записана");
  click(w, $(w, '[data-theme="light"]')); await tick(10);
  ok(w.document.documentElement.dataset.theme === "light", "тема «Светлая»");
  click(w, $(w, '[data-theme="auto"]')); await tick(10);
  ok(!w.document.documentElement.dataset.theme && ui(w).theme === "auto", "тема «Как в системе» снимает принудительную");

  // 7. Режим Pro
  click(w, $(w, '#settings [data-setmode="pro"]'));
  await tick(20);
  ok(w.document.body.dataset.mode === "pro" && ui(w).mode === "pro" && /Pro/.test(text(w, "[data-modebtn]")), "Pro включён и записан");
  ok(/Pro/.test(text(w, ".toasts")), "о смене режима сказало всплывающее сообщение");
  ok(JSON.stringify(ui(w).modules) === JSON.stringify(["food", "sleep", "trainers"]), "выбор разделов при смене режима не изменился");
  ok(!!$(w, "#rep") && !!$(w, "#demo") && /Изучена техника/.test(text(w, "main")), "в Pro в профиле есть выгрузка, демо и изученная техника");
  await go(w, "#/");
  ok(!!$(w, 'a[href="#/ideas"]') && !!$(w, ".tiles") && !$(w, "#stepscard") && !$(w, ".teaser"), "в Pro на главной идеи, плитки программ; нет первых шагов и приглашения");
  ok(!!$(w, "a.nutri") && !!$(w, 'a.card[href="#/sleep"]') && !$(w, 'a[href="#/body"]'), "в Pro разделы по выбору человека: питание и сон есть, вес и рост нет");
  await go(w, "#/food");
  ok(!$(w, ".tip"), "в Pro подсказок нет");

  // 8. Кнопка в шапке
  click(w, $(w, "[data-modebtn]"));
  await tick(20);
  ok(w.document.body.dataset.mode === "lite" && /Lite/.test(text(w, "[data-modebtn]")), "кнопка в шапке вернула Lite");

  // 9. Страница «Как пользоваться»
  await go(w, "#/guide");
  ok(/Как пользоваться/.test(text(w, "h1")) && $$(w, ".faq").length >= 6, "страница гайда: вопросы");
  ok($$(w, ".map").length === 4, "в карте разделов четыре пункта (рейтинг выключен)");
  ok(!!$(w, "#stepscard") && !$(w, "[data-steps-x]"), "первые шаги на странице гайда видны всегда, без «Скрыть»");
  ok(!!$(w, 'a[href="#/profile"]'), "есть ссылка на настройки в профиле");
  click(w, $(w, "[data-replay]"));
  ok(!!$(w, "#onboard") && $(w, '[data-interest="food"]') === null, "«Показать приветствие ещё раз» открывает его снова");
  click(w, $(w, "[data-next]")); click(w, $(w, "[data-next]")); click(w, $(w, "[data-next]"));
  ok($(w, '[data-interest="sleep"]').getAttribute("aria-checked") === "true" && $(w, '[data-interest="rating"]').getAttribute("aria-checked") === "false", "при повторе приветствия стоят текущие настройки");
  key(w, "Escape");
  await tick();
  ok(!$(w, "#onboard"), "Esc закрывает приветствие");
  click(w, $(w, "[data-tips-reset]"));
  await go(w, "#/library");
  ok(!!$(w, '.tip[data-tip="library"]'), "«Вернуть подсказки» вернула скрытую подсказку");

  // 10. Установка как приложение
  await go(w, "#/profile");
  ok(!$(w, "#installcard"), "в jsdom установка недоступна, карточки нет");
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

  // 11. Повторный заход, пропуск приветствия, прежние настройки
  const second = load({ mode: "pro", onboarded: true });
  await tick(20);
  ok(!$(second.w, "#onboard") && second.w.document.body.dataset.mode === "pro" && second.w.document.body.dataset.hide === "", "при повторном заходе приветствия нет, Pro без выбора показывает всё");
  const third = load(null);
  await tick(20);
  click(third.w, $(third.w, "[data-skip]"));
  ok(!$(third.w, "#onboard") && ui(third.w).onboarded === true && ui(third.w).mode === "lite", "«Пропустить» закрывает окно и оставляет Lite");
  ok(third.w.document.body.dataset.hide === "sleep progress rating trainers", "после пропуска включено только питание: " + third.w.document.body.dataset.hide);
  const old = load({ mode: "simple", onboarded: true });
  await tick(20);
  ok(old.w.document.body.dataset.mode === "lite" && /Lite/.test(text(old.w, "[data-modebtn]")), "старое значение режима «simple» открывается как Lite");

  ok(errors.length === 0 && second.errors.length === 0 && third.errors.length === 0 && old.errors.length === 0, "ошибок в консоли нет " + errors.concat(second.errors, third.errors, old.errors).join("; "));
  console.log(`\nпроверок: ${n}, не прошло: ${failed}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
