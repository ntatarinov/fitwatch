// Проходит основные сценарии интерфейса FitWatch в имитации браузера (jsdom). Файлы проекта только читаются.
// Запуск: npm i --no-save jsdom && node test-ui/flow.js  (jsdom не входит в зависимости проекта).
// Это НЕ настоящий браузер: видео YouTube, звук, конфетти, загрузка модели по фото и вид на телефоне здесь не проверяются.
const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const ROOT = path.join(__dirname, "..");

function load() {
  let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => "<script>" + fs.readFileSync(path.join(ROOT, src), "utf8").replace(/<\/script>/g, "<\\/script>") + "</script>");
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => errors.push(String(e.stack || e).split("\n")[0]));
  vc.on("error", e => errors.push(String(e)));
  const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, beforeParse(win) { try { win.localStorage.setItem("fitwatch.ui", JSON.stringify({ mode: "pro", onboarded: true, welcomeOff: true })); } catch (e) { /* без хранилища */ } win.scrollTo = () => {}; win.HTMLCanvasElement.prototype.getContext = () => null; } });
  dom.window.alert = msg => { dom.window.__alerts = (dom.window.__alerts || []).concat(msg); };
  dom.window.confirm = () => true;
  dom.window.scrollTo = () => {};
  return { dom, w: dom.window, errors };
}
const tick = (w, ms = 5) => new Promise(r => setTimeout(r, ms));
async function go(w, hash) { w.location.hash = hash; await tick(w); }
const $ = (w, sel) => w.document.querySelector(sel);
const $$ = (w, sel) => Array.from(w.document.querySelectorAll(sel));
const text = (w, sel) => ($(w, sel) || { textContent: "" }).textContent;
const state = w => JSON.parse(w.localStorage.getItem("fitwatch.v1") || "null");
let n = 0, failed = 0;
function ok(cond, name) { n++; if (!cond) { failed++; console.log("FAIL:", name); } else console.log("ok  :", name); }
const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

(async () => {
  const { w, errors } = load();
  await tick(w, 20);
  // 1. главная без анкеты
  ok(/Подобрать план/.test(text(w, "main")), "главная: предложение подобрать план");

  // 2. анкета -> план
  await go(w, "#/me");
  ok(!!$(w, "#meform"), "анкета открылась");
  const f = $(w, "#meform");
  const set = (name, val) => { const i = f.querySelector(`input[name="${name}"][value="${val}"]`); i.checked = true; };
  set("goal", "muscle"); set("level", "2"); set("days", "4"); set("minutes", "45"); set("place", "dumbbells");
  f.querySelector('input[name="limits"][value="knees"]').checked = true;
  set("sex", "m"); f.elements.age.value = "30"; f.elements.height.value = "180"; f.elements.weight.value = "80"; f.elements.name.value = "Тест";
  f.dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true }));
  await tick(w, 20);
  ok(w.location.hash === "#/plan", "после анкеты открылся план");
  const st = state(w);
  ok(st && st.me && st.me.goal === "muscle" && st.me.limits[0] === "knees" && st.plan.days.length === 4, "анкета и план сохранены");
  ok($$(w, "main a.card").length === 4, "в плане 4 дня");
  ok(!/Выпады|Приседания|Кубковый|Жим ногами/.test(text(w, "main")), "план не содержит упражнений, вредных для коленей");

  // 2b. неверная анкета
  await go(w, "#/me");
  const f2 = $(w, "#meform"); f2.elements.age.value = "7";
  f2.dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true }));
  ok(/Проверь значения/.test(text(w, "#meerr")) && w.location.hash === "#/me", "анкета: неверный возраст не принят");

  // 3. день плана и отметка тренировки
  await go(w, "#/pd/w1");
  ok(/День 1/.test(text(w, "h1")) && $$(w, "main .card .pill").length >= 3, "день плана открылся");
  const before = text(w, "#badge");
  click(w, $(w, "#done"));
  await tick(w);
  const st2 = state(w);
  ok(st2.log.length === 1 && st2.log[0].p === "plan" && st2.log[0].d === "w1" && st2.log[0].t, "тренировка по плану записана");
  ok(/Тренировка засчитана/.test(text(w, "#checkin")), "показано подтверждение");
  ok(text(w, "#badge") !== before, "баллы выросли");
  ok(!!$(w, "#checkin .celebrate"), "праздник показан");
  await tick(w, 1100);
  ok(text(w, "#cu") === "20", "счётчик баллов дошёл до 20");
  ok(/Достижение: Первый шаг/.test(text(w, ".toasts")), "уведомление о достижении «Первый шаг»");
  ok(state(w).seen.includes("first") && state(w).seen.includes("plan"), "достижения записаны как показанные");
  await go(w, "#/");
  ok($$(w, 'main a.card[href="#/pd/w2"]').length === 1, "главная ведёт к следующему дню плана");
  ok(!!$(w, ".ring .val") && /1\/4/.test(text(w, ".ring .num")), "главная: кольцо недели 1/4");
  ok(!!$(w, ".flame") && !$(w, ".flame.off") && text(w, ".streak .n") === "1", "главная: огонёк серии 1");
  ok($$(w, ".dot").length === 7 && $$(w, ".dot.done").length === 1 && $$(w, ".dot.today").length === 1, "главная: 7 точек недели, сегодня отмечено");
  await tick(w, 120);
  ok(/%$/.test($(w, ".xp > i").style.width) && $(w, ".xp > i").style.width !== "0%", "главная: шкала уровня заполнилась");
  ok(/Уровень 1 · Новичок/.test(text(w, "main")) && /Следующее достижение/.test(text(w, "main")), "главная: уровень и подсказка достижения");

  // 4. каталог и модель тела
  await go(w, "#/library");
  ok($$(w, "#bodywrap .mz").length === 9 && $$(w, "#bodywrap .ml").length === 9 && /Квадрицепс/.test(text(w, "#bodywrap")), "манекен спереди: 9 мышц, у каждой подпись");
  const total = Number(/из (\d+)/.exec(text(w, "#libcount"))[1]);
  ok(total === 43, "в каталоге 43 упражнения");
  const chest = $(w, '.mz[data-m="chest"]');
  click(w, chest);
  ok($$(w, ".mz.on").length === 1 && /Грудь/.test(text(w, ".ml.on")) && /Грудь/.test(text(w, "#musclesel")), "выбрана грудь: подсвечены мышца и подпись");
  click(w, $(w, '#bodywrap .ml[data-m="abs"]'));
  ok(/Пресс/.test(text(w, "#musclesel")), "нажатие на подпись тоже выбирает мышцу");
  click(w, $(w, '#bodywrap [data-view="back"]'));
  ok($$(w, "#bodywrap .mz").length === 8 && /Широчайшие/.test(text(w, "#bodywrap")) && !/Пресс/.test(text(w, "#musclesel")), "«Сзади»: 8 мышц спины, выбор пресса снят (его не видно сзади)");
  click(w, $(w, '#bodywrap [data-view="3d"]'));
  await tick(w, 40);
  ok($(w, '#bodywrap [data-view="3d"]').classList.contains("on") && $$(w, "#bodywrap .b3d-list [data-m]").length === 14, "режим 3D: под манекеном список из 14 мышц");
  ok(/3D сейчас недоступно/.test(text(w, "#b3d")) && !!$(w, '#b3d [data-view="front"]'), "без объёмной графики — честное сообщение и кнопка «Показать рисунок»");
  click(w, $(w, '#bodywrap .b3d-list [data-m="glutes"]'));
  ok(/Ягодицы/.test(text(w, "#musclesel")) && $(w, '#bodywrap .b3d-list [data-m="glutes"]').classList.contains("on") && $$(w, "#liblist .lib-row").length >= 2, "в 3D выбор из списка: ягодицы, ниже упражнения для них");
  ok($$(w, "#liblist img.thumb").length >= 1 && /i\.ytimg\.com\/vi\/[\w-]+\/mqdefault\.jpg/.test($(w, "#liblist img.thumb").getAttribute("src")), "у упражнений с видео есть картинка-превью");
  click(w, $(w, '#b3d [data-view="front"]'));
  ok(!$(w, "#b3d") && $$(w, "#bodywrap .mz").length >= 8, "«Показать рисунок» возвращает нарисованный манекен");
  click(w, $(w, '#bodywrap [data-view="front"]'));
  click(w, $(w, '.mz[data-m="chest"]'));
  ok($$(w, "#liblist a.card").length >= 3 && $$(w, "#liblist a.card").every(a => /Грудь/.test(a.textContent)), "в списке только упражнения для груди");
  click(w, $(w, "#muscleclear"));
  ok($$(w, ".mz.on").length === 0, "выбор мышцы сброшен");
  const q = $(w, "#libq"); q.value = "мёртвый"; q.dispatchEvent(new w.Event("input", { bubbles: true }));
  ok($$(w, "#liblist a.card").length === 1, "поиск «мёртвый» нашёл одно упражнение");
  q.value = ""; q.dispatchEvent(new w.Event("input", { bubbles: true }));
  ok(!!$(w, "#libLimits"), "есть переключатель ограничений, так как они указаны");
  const cnt1 = $$(w, "#liblist a.card").length;
  $(w, "#libLimits").checked = false; $(w, "#libLimits").dispatchEvent(new w.Event("change", { bubbles: true }));
  ok($$(w, "#liblist a.card").length > cnt1, "без учёта ограничений упражнений больше");
  const eq = $(w, "#libeq"); eq.value = "machine"; eq.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok($$(w, "#liblist a.card").length === 2, "тренажёры: 2 упражнения");
  eq.value = ""; eq.dispatchEvent(new w.Event("change", { bubbles: true }));
  await go(w, "#/library/glutes");
  ok($$(w, ".mz.on").length === 1 && /Ягодицы/.test(text(w, "#musclesel")) && $(w, '#bodywrap [data-view="back"]').classList.contains("on"), "ссылка с мышцей выбирает её и сама поворачивает фигуру спиной");

  // 5. страница упражнения
  await go(w, "#/x/lunge");
  ok(/Выпады/.test(text(w, "h1")) && !!$(w, "#yt") && $$(w, "ol li").length >= 3, "упражнение с видео и шагами");
  ok(/колен/i.test(text(w, "main")), "предупреждение об ограничении колен");
  await go(w, "#/x/brisk_walk");
  ok(/Видео для этого упражнения пока нет/.test(text(w, "main")) && !$(w, "#yt"), "упражнение без видео: честная пометка");
  await go(w, "#/x/nope");
  ok(/Не найдено/.test(text(w, "h1")), "несуществующее упражнение: не найдено");

  // 6. питание
  await go(w, "#/food");
  ok(/Белки/.test(text(w, "main")) && /Ориентир по твоим параметрам: 30\d\d ккал/.test(text(w, "main")), "питание: цели по БЖУ из анкеты");
  const fs_ = $(w, "#fsearch"); fs_.value = "Банан"; fs_.dispatchEvent(new w.Event("input", { bubbles: true }));
  ok($(w, "#fgrams").value === "120" && /кк?ал/.test(text(w, "#fprev")) && !$(w, "#faddbtn").disabled, "выбран банан: масса и расчёт");
  $(w, "#fgrams").value = "200"; $(w, "#fgrams").dispatchEvent(new w.Event("input", { bubbles: true }));
  ok(/178 ккал/.test(text(w, "#fprev")), "расчёт для 200 г банана: 178 ккал");
  $(w, "#addf").dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true }));
  await tick(w);
  let food = state(w).food;
  ok(food.length === 1 && food[0].kcal === 178 && food[0].p === 2.2 && food[0].nid === "banana" && food[0].grams === 200, "банан записан с БЖУ");
  const gi = $(w, "[data-gi]"); gi.value = "100"; gi.dispatchEvent(new w.Event("change", { bubbles: true }));
  await tick(w);
  food = state(w).food;
  ok(food[0].kcal === 89 && food[0].grams === 100, "правка массы пересчитала калории");
  click(w, $(w, '[data-quick="egg"]')); await tick(w);
  ok(state(w).food.length === 2 && state(w).food[1].name === "Яйцо куриное", "быстрое добавление");
  // своё блюдо: неполное БЖУ отклоняется
  const ff = $(w, "#ff");
  ff.elements.name.value = "Мой салат"; ff.elements.kcal.value = "300"; ff.elements.p.value = "10";
  ff.dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true })); await tick(w);
  ok(state(w).food.length === 2 && (w.__alerts || []).length === 1, "своё блюдо с неполным БЖУ не принято");
  const ff2 = $(w, "#ff");
  ff2.elements.name.value = "Мой салат"; ff2.elements.kcal.value = "300"; ff2.elements.p.value = "10"; ff2.elements.f.value = "12"; ff2.elements.c.value = "30";
  ff2.dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true })); await tick(w);
  ok(state(w).food.length === 3 && state(w).food[2].p === 10, "своё блюдо с полным БЖУ принято");
  ff2.elements; // старая форма уже заменена
  const ff3 = $(w, "#ff");
  ff3.elements.name.value = "Только калории"; ff3.elements.kcal.value = "120";
  ff3.dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true })); await tick(w);
  ok(state(w).food.length === 4 && state(w).food[3].p === undefined && /только калории/.test(text(w, "main")), "своё блюдо без БЖУ: только калории");
  ok(/из 2\d\d\d ккал|ккал из/.test(text(w, "main")) && /Записей только с калориями \(без БЖУ\): 1/.test(text(w, "main")), "итоги учитывают записи без БЖУ отдельно");
  click(w, $(w, "[data-del]")); await tick(w);
  ok(state(w).food.length === 3, "удаление записи");
  click(w, $(w, "#usetg")); await tick(w);
  ok(state(w).kcalGoal >= 2000 && state(w).kcalGoal !== 2000, "цель калорий взята из расчёта");

  // 7. профиль и отчёт
  await go(w, "#/profile");
  ok(/Моя цель и параметры/.test(text(w, "main")) && /Мой план · День 1/.test(text(w, "main")), "профиль: анкета и история по плану");
  ok(/## Анкета/.test($(w, "#rep").value) && /Мой план: День 1/.test($(w, "#rep").value) && /Б \d/.test($(w, "#rep").value), "отчёт содержит анкету, план и БЖУ");
  ok(!/Claude/.test(text(w, "main")), "в профиле нет упоминания Claude");

  // 7b. звук и достижения
  ok(!w.document.getElementById("snd"), "в шапке кнопки звука нет: она в настройках");
  ok($(w, "[data-sound-toggle]").getAttribute("aria-checked") === "true", "звук по умолчанию включён");
  click(w, $(w, "[data-sound-toggle]")); await tick(w, 20);
  ok(w.localStorage.getItem("fitwatch.sound") === "off" && $(w, "[data-sound-toggle]").getAttribute("aria-checked") === "false", "звук выключается в настройках и запоминается");
  click(w, $(w, "[data-sound-toggle]")); await tick(w, 20);
  ok(w.localStorage.getItem("fitwatch.sound") === "on", "звук включается обратно");
  await go(w, "#/profile");
  ok(/Достижения/.test(text(w, "main")) && $$(w, ".bd.got").length >= 2 && $$(w, ".bd.lock").length >= 5, "профиль: открытые и закрытые достижения");
  w.document.querySelector(".toasts").innerHTML = "";
  click(w, $(w, "#demo")); await tick(w, 120);
  ok($$(w, ".toast").length === 0, "демо-данные не вызывают лавину уведомлений");
  ok(state(w).seen.length >= 3, "после демо достижения отмечены как показанные");

  // 7b2. справочник тренажёров и новые программы
  await go(w, "#/programs");
  ok(!!$(w, 'a[href="#/machines"]') && $$(w, 'a[href="#/p/travel"]').length === 1 && $$(w, 'a[href="#/p/runyoga"]').length === 1, "в тренировках есть справочник тренажёров и программы «В поездке» и «Для бегунов»");
  await go(w, "#/machines");
  ok(/Справочник тренажёров/.test(text(w, "h1")) && $$(w, 'main a.row-link[href^="#/machines/"]').length >= 12 && /Общие правила/.test(text(w, "main")), "справочник: список тренажёров и общие правила");
  await go(w, "#/machines/leg_press");
  ok(/Жим ногами/.test(text(w, "h1")) && /Как настроить/.test(text(w, "main")) && /Техника по шагам/.test(text(w, "main")) && /Безопасность/.test(text(w, "main")), "тренажёр: настройка, техника, безопасность");
  ok($(w, 'a[href="#/x/leg_press"]') !== null, "из тренажёра можно перейти к упражнению с видео");
  await go(w, "#/machines/nope");
  ok(/Не найдено/.test(text(w, "main")), "несуществующий тренажёр: «Не найдено»");
  await go(w, "#/p/travel");
  ok(/В поездке/.test(text(w, "h1")) && $$(w, 'main a.card[href^="#/d/travel/"]').length === 3 && $$(w, 'main a.card[href^="#/e/travel/"]').length >= 8, "«В поездке»: 3 дня и разбор упражнений");
  await go(w, "#/e/travel/incline_pushup");
  ok(/Отжимания от опоры/.test(text(w, "main")) && !!$(w, ".video"), "упражнение из каталога открывается внутри программы, с видео");
  await go(w, "#/p/runyoga");
  ok(/бегунов/.test(text(w, "h1")) && $$(w, 'main a.card[href^="#/d/runyoga/"]').length === 3, "«Йога и растяжка для бегунов»: 3 комплекса");
  await go(w, "#/e/runyoga/down_dog");
  ok(/Собака мордой вниз/.test(text(w, "main")) && /Видео для этого упражнения пока нет/.test(text(w, "main")), "упражнение без видео честно об этом говорит, техника описана");
  await go(w, "#/d/runyoga/d2");
  ok(/\+10/.test(text(w, "#checkin")) || /уже засчитана/.test(text(w, "#checkin")), "день йоги — лёгкий: 10 баллов");

  // 7c. идеи команды
  await go(w, "#/ideas");
  ok(/Идеи команды/.test(text(w, "h1")) && $$(w, ".person").length === 2, "идеи: два участника");
  ok(/52%/.test(text(w, ".persons")) && /36%/.test(text(w, ".persons")), "идеи: проценты 52% и 36%");
  ok($$(w, "#ideaslist .idea").length === 44 && $$(w, ".idea.st-ready").length >= 9, "идеи: 44 идеи, готовые отмечены");
  click(w, $(w, '[data-st="ready"]'));
  ok($$(w, "#ideaslist .idea").length === 12 && $$(w, "#ideaslist .idea").every(e => /Готово/.test(e.textContent)), "идеи: фильтр «Готово» оставляет 12 (9 у Сани и 3 у Айдархана)");
  click(w, $(w, '[data-who="aidarkhan"]'));
  ok($$(w, "#ideaslist .idea").length === 3, "идеи: у Айдархана три готовые (тренажёры, поездки, бегуны)");
  click(w, $(w, '[data-st=""]')); click(w, $(w, '[data-who=""]'));
  const links = $$(w, ".idea a.btn").map(a => a.getAttribute("href"));
  ok(links.length >= 12, "идеи: у готовых и частичных есть кнопка «Посмотреть» (" + links.length + ")");
  let badLinks = [];
  for (const h of Array.from(new Set(links))) { await go(w, h); if (/Не найдено/.test(text(w, "main")) || text(w, "main").length < 30) badLinks.push(h); }
  ok(badLinks.length === 0, "идеи: все ссылки «Посмотреть» открывают экраны " + badLinks.join(","));
  await go(w, "#/ideas");
  const heads = $$(w, "main h2").map(e => e.textContent);
  ok(!/Главное по просьбе/.test(text(w, "main")), "идеи: прежнего блока «Главное по просьбе Айдархана» нет");
  ok(heads.indexOf("Все идеи") >= 0 && heads.indexOf("Основа платформы из переписки") > heads.indexOf("Все идеи"), "идеи: «Основа платформы из переписки» стоит ниже списка идей, отдельным блоком");
  ok(/не 11 идей Айдархана/.test(text(w, "main")) && /В проценты выше не входит/.test(text(w, "main")), "идеи: подписано, что основа не его идеи и в проценты не входит");
  ok($$(w, "#ideaslist .idea").length === 44 && $$(w, ".idea").length === 50, "идеи: 44 идеи в списке и 6 пунктов основы отдельно");
  click(w, $(w, '[data-who="aidarkhan"]'));
  ok($$(w, "#ideaslist .idea").length === 11 && $$(w, "#ideaslist .idea .ask").length === 11, "идеи: у всех 11 идей Айдархана показана его формулировка");
  ok(/Встроенный маркетплейс/.test(text(w, "#idea-B1")) && /правила безопасности и пошаговая техника/.test(text(w, "#idea-B2")), "идеи: тексты идей взяты из его списка");
  click(w, $(w, '[data-who=""]'));
  const foundationStatus = $$(w, ".idea").slice(44).map(e => e.querySelector(".st").textContent);
  ok(foundationStatus.join() === "Готово,Частично,Частично,Частично,Готово,Частично", "идеи: статусы основы совпадают с идеями Сани: " + foundationStatus.join());
  ok($$(w, ".idea").slice(44).filter(e => /Статус общий с идеей Сани/.test(e.textContent)).length === 4, "идеи: у четырёх пунктов основы указано, с какой идеей Сани статус общий");
  await go(w, "#/ideas/K5");
  ok(!!$(w, "#idea-K5.hl"), "идеи: ссылка с номером подсвечивает идею");
  await go(w, "#/library");
  ok(!!$(w, ".idea-chip"), "на экране каталога есть метка идеи команды");
  await go(w, "#/");
  ok(/Идеи команды/.test(text(w, "main")), "главная ведёт в «Идеи команды»");

  // 7d. сон
  await go(w, "#/sleep");
  ok(/Сон/.test(text(w, "h1")) && !!$(w, "#sform"), "сон: страница открылась");
  const sf = $(w, "#sform").elements; sf.hours.value = "5"; sf.q.value = "2";
  $(w, "#sform").dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true }));
  await tick(w, 30);
  ok(state(w).sleep.length === 1 && state(w).sleep[0].hours === 5 && /5\s*ч|5<\/b> ч/.test(w.document.body.innerHTML), "сон: запись сохранена");
  await go(w, "#/checkin");
  await go(w, "#/");
  ok(/Сегодня мягко: мало сна|Ты спал меньше 6 часов|уже засчитана|Сегодня всё сделано/.test(text(w, ".hero")), "совет дня учитывает недосып (или тренировка уже была)");
  ok(!!$(w, 'a.card[href="#/sleep"]') && /Сон/.test(text(w, 'a.card[href="#/sleep"]')), "на главной есть карточка сна");

  // 8. старые маршруты работают
  for (const h of ["#/programs", "#/p/start", "#/d/start/d1", "#/e/start/squat", "#/trainer", "#/checkin", "#/plan"]) {
    await go(w, h);
    ok(!/Не найдено/.test(text(w, "main")) && text(w, "main").length > 40, "маршрут " + h);
  }
  // 9. старые данные (без анкеты и с записями без БЖУ) открываются
  const { w: w2, errors: e2 } = (() => { const x = load(); return x; })();
  await tick(w2, 20);
  w2.localStorage.setItem("fitwatch.v1", JSON.stringify({ name: "Старый", done: {}, watched: {}, log: [{ date: "2026-10-20", p: "start", d: "d1", points: 20 }], checkins: [], food: [{ date: w2.eval("(function(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})()"), name: "Яблоко", kcal: 80 }], kcalGoal: 2000 }));
  w2.location.reload;
  const { w: w3, errors: e3 } = (() => { const x = load(); return x; })();
  w3.localStorage.setItem("fitwatch.v1", w2.localStorage.getItem("fitwatch.v1"));
  await go(w3, "#/food");
  ok(/Яблоко/.test(text(w3, "main")), "старая запись без БЖУ показывается");
  ok(e2.length === 0 && e3.length === 0, "ошибок в консоли у старых данных нет");

  ok(errors.length === 0, "ошибок скриптов нет: " + errors.join(" | "));
  console.log(`\nпроверок: ${n}, не прошло: ${failed}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("СБОЙ СЦЕНАРИЯ:", e); process.exit(2); });
