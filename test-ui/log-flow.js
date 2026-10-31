// Запись тренировки (подходы, повторения, вес, таймер), итог, статистика, отправка на сервер и тренеру. jsdom, сервер подменён.
// Запуск: npm i --no-save jsdom && node test-ui/log-flow.js.
const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const ROOT = path.join(__dirname, "..");

function boot({ state, routes, ui } = {}) {
  let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => "<script>" + fs.readFileSync(path.join(ROOT, src), "utf8").replace(/<\/script>/g, "<\\/script>") + "</script>");
  const errors = [], vc = new VirtualConsole(), calls = [];
  vc.on("jsdomError", e => errors.push(String(e.stack || e).split("\n")[0])); vc.on("error", e => errors.push(String(e)));
  const dom = new JSDOM(html, { url: "http://localhost/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) {
    w.scrollTo = () => {}; w.HTMLCanvasElement.prototype.getContext = () => null;
    w.localStorage.setItem("fitwatch.ui", JSON.stringify(ui || { mode: "pro", onboarded: true, welcomeOff: true }));
    if (state !== undefined) w.localStorage.setItem("fitwatch.v1", typeof state === "string" ? state : JSON.stringify(state));
    w.fetch = async (u, init) => {
      init = init || {};
      const U = new URL(u, "http://localhost"), method = init.method || "GET", body = init.body ? JSON.parse(init.body) : undefined;
      calls.push({ method, path: U.pathname + U.search, body });
      const r = (routes && routes(method, U.pathname + U.search, body)) || { status: 401, body: { error: "Нужно войти" } };
      if (r.status === 0) throw new TypeError("Failed to fetch");
      return { ok: r.status < 400, status: r.status, json: async () => r.body };
    };
  } });
  dom.window.confirm = () => true; dom.window.alert = () => {};
  return { w: dom.window, errors, calls };
}
const tick = (ms = 15) => new Promise(r => setTimeout(r, ms));
const $ = (w, s) => w.document.querySelector(s), $$ = (w, s) => Array.from(w.document.querySelectorAll(s));
const text = (w, s) => ($(w, s) || { textContent: "" }).textContent.replace(/ /g, " ");
const go = async (w, h, ms = 40) => { w.location.hash = h; await tick(ms); };
const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const type = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event("input", { bubbles: true })); };
const submit = (w, f) => f.dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true }));
const stateOf = w => JSON.parse(w.localStorage.getItem("fitwatch.v1"));
const pad = n => String(n).padStart(2, "0");
const dayStr = off => { const d = new Date(Date.now() - off * 86400000); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
const UID = n => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const USER = { id: "u1", name: "Тест", email: "t@t.kz", isTrainer: false, isAdmin: false, ratingOptIn: true, hasPassword: true, telegram: { linked: false } };
const ME = { status: 200, body: { user: USER, profile: {}, stats: { points: 10, streak: 1, workouts: 1 } } };
const sess = (n, off, title, items, sec) => ({ id: UID(n), date: dayStr(off), startedAt: new Date(Date.now() - off * 86400000).toISOString(), durationSec: sec, title, items });
let n = 0, failed = 0;
function ok(c, name) { n++; if (!c) { failed++; console.log("FAIL:", name); } else console.log("ok  :", name); }

(async () => {
  // 1. Свободная тренировка: старт, упражнение, подходы, итоги
  {
    const { w, errors } = boot({});
    await tick(60);
    ok(/Записать тренировку/.test(text(w, "main")) && !!$(w, 'main a[href="#/stats"]'), "на главной есть «Записать тренировку» и «Моя статистика»");
    await go(w, "#/log");
    ok(/Запись тренировки/.test(text(w, "h1")) && !!$(w, "#lblank") && !$(w, "#lrepeat"), "экран старта: «Начать свою тренировку», повторять пока нечего");
    click(w, $(w, "#lblank")); await tick(20);
    ok(!!$(w, "#lclock") && /^\d+:\d\d$/.test(text(w, "#lclock").trim()) && stateOf(w).draft && stateOf(w).draft.items.length === 0, "тренировка началась: таймер идёт, черновик сохранён");
    ok(!$(w, "#lpick").hidden, "предлагается добавить первое упражнение");
    type(w, $(w, "#lsearch"), "жим"); await tick(10);
    const picks = $$(w, "#lres [data-add]");
    ok(picks.length >= 1 && picks.every(b => /жим/i.test(b.textContent)), "поиск «жим» находит упражнения: " + picks.map(b => b.querySelector("b").textContent).join(", "));
    click(w, picks[0]); await tick(10);
    const exName = text(w, ".lg-ex b");
    ok($$(w, ".lg-ex").length === 1 && $$(w, ".lg-set").length === 1, "упражнение добавлено с одним подходом: " + exName);
    const inp = (s, f) => $(w, `[data-i="0"][data-s="${s}"][data-f="${f}"]`);
    type(w, inp(0, "reps"), "8"); type(w, inp(0, "kg"), "60");
    ok(/1 подходов/.test(text(w, "#lsum")) && /480 кг/.test(text(w, "#lsum")), "итог под руками считается сразу: 1 подход, 480 кг");
    click(w, $(w, '[data-add-set="0"]')); await tick(10);
    ok($$(w, ".lg-set").length === 2 && inp(1, "reps").getAttribute("placeholder") === "8" && inp(1, "kg").getAttribute("placeholder") === "60", "новый подход подсказывает значения предыдущего (8 × 60)");
    type(w, inp(1, "reps"), "8"); type(w, inp(1, "kg"), "62,5");
    click(w, $(w, '[data-add-set="0"]')); await tick(10);
    type(w, inp(2, "reps"), "6x"); type(w, inp(2, "kg"), "60.55");
    ok(inp(2, "reps").value === "6" && inp(2, "kg").value === "60.5", "в поля попадают только цифры: «6x» → 6, «60.55» → 60.5");
    ok(/3 подходов/.test(text(w, "#lsum")) && /1 280 кг|1,3 т/.test(text(w, "#lsum")), "итог: 3 подхода: " + text(w, "#lsum"));
    click(w, $(w, '[data-rm-set="0:2"]')); await tick(10);
    ok($$(w, ".lg-set").length === 2 && /2 подходов/.test(text(w, "#lsum")), "лишний подход убран, итог пересчитан");
    type(w, $(w, "#ltitle"), "Грудь и трицепс");
    // сохранение без подходов не проходит
    const empty = boot({}); await tick(60); await go(empty.w, "#/log"); click(empty.w, $(empty.w, "#lblank")); await tick(10);
    type(empty.w, $(empty.w, "#lsearch"), "присед"); await tick(10); click(empty.w, $(empty.w, "#lres [data-add]")); await tick(10);
    click(empty.w, $(empty.w, "#lfinish"));
    ok(/Запиши хотя бы один подход/.test(text(empty.w, "#lfin")), "завершение без подходов: просьба записать хотя бы один");
    // завершение
    click(w, $(w, "#lfinish")); await tick(10);
    ok(!!$(w, "#lmin") && +$(w, "#lmin").value >= 1, "завершение: спрашивает, сколько минут заняло");
    type(w, $(w, "#lmin"), "0"); click(w, $(w, "#lsave"));
    ok(/Минуты: от 1 до 600/.test(text(w, "#lerr")) && stateOf(w).sessions.length === 0, "нулевые минуты не принимаются");
    type(w, $(w, "#lmin"), "55"); click(w, $(w, "#lsave")); await tick(40);
    ok(w.location.hash.startsWith("#/session/") && w.location.hash.endsWith("/new"), "после сохранения открывается итог тренировки");
    const kp = $$(w, ".kpis3 .kv").map(e => e.textContent.replace(/ /g, " "));
    ok(kp[0] === "55 мин" && kp[1] === "2" && kp[2] === "980 кг", "итог: время 55 мин, 2 подхода, 980 кг: " + kp.join(" | "));
    ok(/Тренировка записана/.test(text(w, "main")) && /Грудь и трицепс/.test(text(w, "h1")) && /8 × 60 кг/.test(text(w, "main")) && /8 × 62,5 кг/.test(text(w, "main")), "заголовок, подходы с весом");
    ok(/Какие мышцы работали/.test(text(w, "main")) && $$(w, ".tag").length >= 1, "перечислены работавшие мышцы");
    const st = stateOf(w);
    ok(st.sessions.length === 1 && st.draft === null && st.sessions[0].durationSec === 3300 && st.sessions[0].program === null, "тренировка сохранена, черновик очищен");
    ok(st.log.length === 1 && st.log[0].p === "free" && st.log[0].sid === st.sessions[0].id, "запись подходов засчитана как тренировка дня и привязана к ней");
    ok(!$(w, "#lsendbtn") && /Войди в аккаунт/.test(text(w, "#lsend")), "без входа: «Войди, чтобы отправить тренеру»");
    ok(errors.length === 0, "без ошибок в консоли " + errors.join(" | "));

    // 2. Статистика по этой тренировке
    await go(w, "#/stats");
    const k2 = $$(w, ".kpis3 .kv").map(e => e.textContent.replace(/ /g, " "));
    ok(k2[0] === "1" && k2[1] === "55 мин" && k2[2] === "980 кг", "статистика за неделю: 1 тренировка, 55 мин, 980 кг (запись не задвоилась): " + k2.join(" | "));
    ok($$(w, ".mz.lv-1").length >= 1 && $$(w, ".stat-figs svg").length === 2, "на манекене окрашены мышцы, работавшие в тренировке");
    ok(/Дерево: \d/.test(text(w, ".lv-legend")) && /Золото: 0/.test(text(w, ".lv-legend")), "легенда уровней со счётчиками");
    const mz = $$(w, ".stat-figs .mz.lv-1")[0];
    click(w, mz);
    ok(/Дерево, \d+ подходов/.test(text(w, "#mcap")) && $$(w, ".mz.picked").length >= 1, "нажатие на мышцу: уровень и число подходов");
    click(w, $(w, '.stat-figs .mz[data-m="calves"]'));
    ok(/нагрузки за этот период не было/.test(text(w, "#mcap")), "у не работавшей мышцы честно сказано, что нагрузки не было");
    ok(/Грудь и трицепс/.test(text(w, "main")) && $$(w, 'main a[href^="#/session/"]').length === 1, "в истории есть эта тренировка со ссылкой");
    click(w, $(w, 'main a[href^="#/session/"]')); await tick(30);
    ok(/Грудь и трицепс/.test(text(w, "h1")) && !/Тренировка записана/.test(text(w, "main")), "из истории открывается итог без поздравления");

    // 3. Повторить тренировку: подсказки из прошлой, потом удаление
    click(w, $(w, "#lagain")); await tick(30);
    ok(w.location.hash === "#/log" && $$(w, ".lg-ex").length === 1 && inputPlaceholders(w).join() === "8,60,8,62.5".replace("62.5", "62,5"), "«Повторить»: те же упражнения, пустые поля с подсказками 8×60 и 8×62,5: " + inputPlaceholders(w).join());
    click(w, $(w, "#ldiscard")); await tick(20);
    ok(stateOf(w).draft === null, "тренировку можно отменить");
    await go(w, "#/session/" + stateOf(w).sessions[0].id);
    click(w, $(w, "#ldel")); await tick(30);
    ok(stateOf(w).sessions.length === 0 && /Статистика/.test(text(w, "h1")), "запись удалена");
    ok(stateOf(w).log.length === 1 && !stateOf(w).log[0].sid, "у отметки дня снята привязка: она снова считается тренировкой сама");
  }

  // 4. Черновик переживает перезагрузку страницы
  {
    const a = boot({}); await tick(60);
    await go(a.w, "#/log"); click(a.w, $(a.w, "#lblank")); await tick(10);
    type(a.w, $(a.w, "#lsearch"), "присед"); await tick(10); click(a.w, $(a.w, "#lres [data-add]")); await tick(10);
    type(a.w, $(a.w, '[data-i="0"][data-s="0"][data-f="reps"]'), "12"); type(a.w, $(a.w, '[data-i="0"][data-s="0"][data-f="kg"]'), "100");
    const saved = a.w.localStorage.getItem("fitwatch.v1");
    const b = boot({ state: saved }); await tick(60);
    ok(/Продолжить тренировку/.test(text(b.w, "main")), "после перезагрузки на главной «Продолжить тренировку»");
    await go(b.w, "#/log");
    ok($(b.w, '[data-i="0"][data-s="0"][data-f="reps"]').value === "12" && $(b.w, '[data-i="0"][data-s="0"][data-f="kg"]').value === "100" && /1 подходов/.test(text(b.w, "#lsum")), "введённые значения на месте");
  }

  // 5. Из дня программы: упражнения подставлены; отметка дня и подходы — одна тренировка
  {
    const { w } = boot({}); await tick(60);
    await go(w, "#/d/start/d1");
    ok(!!$(w, 'a[href="#/log/start/d1"]') && /Записать подходы и веса/.test(text(w, "main")), "в дне программы есть «Записать подходы и веса»");
    click(w, $(w, "#done")); await tick(30);
    await go(w, "#/log/start/d1");
    ok($$(w, ".lg-ex").length === 2 && /Приседания/.test(text(w, "#litems")) && $$(w, ".lg-ex")[0].querySelectorAll(".lg-set").length === 3 && /День 1/.test($(w, "#ltitle").value), "подставлены упражнения дня: приседания (3 подхода) и планка");
    ok($(w, '[data-i="0"][data-s="0"][data-f="reps"]').getAttribute("placeholder") === "10", "в подсказке число повторений из программы");
    type(w, $(w, '[data-i="0"][data-s="0"][data-f="reps"]'), "10"); type(w, $(w, '[data-i="0"][data-s="0"][data-f="kg"]'), "0");
    click(w, $(w, "#lfinish")); await tick(10); type(w, $(w, "#lmin"), "30"); click(w, $(w, "#lsave")); await tick(40);
    const st = stateOf(w);
    ok(st.log.length === 1 && st.log[0].sid === st.sessions[0].id && st.sessions[0].program === "start" && st.sessions[0].dayId === "d1", "отметка программы привязана к записи: тренировка одна, баллы не удвоены");
    await go(w, "#/stats/month");
    ok($$(w, ".kpis3 .kv")[0].textContent === "1", "в статистике одна тренировка, а не две");
    // начатая тренировка не стирается молча
    await go(w, "#/log"); click(w, $(w, "#lblank")); await tick(10);
    type(w, $(w, "#lsearch"), "жим"); await tick(10); click(w, $(w, "#lres [data-add]")); await tick(10);
    type(w, $(w, '[data-i="0"][data-s="0"][data-f="reps"]'), "5");
    await go(w, "#/log/start/d2");
    ok(/Есть начатая тренировка/.test(text(w, "h1")) && !!$(w, "#lnew"), "если уже идёт тренировка с данными, спрашивает, что делать");
  }

  // 6. Статистика по набору тренировок: недели, месяц, уровни
  {
    const squat = (reps, kg) => ({ ex: "squat", name: "Приседания", sets: Array.from({ length: 5 }, () => ({ reps, kg })) });
    const bench = { ex: "db_bench", name: "Жим гантелей лёжа", sets: Array.from({ length: 16 }, () => ({ reps: 10, kg: 20 })) };
    const state = { name: "Тест", sessions: [
      sess(1, 0, "Ноги", [squat(8, 100)], 3600), sess(2, 2, "Грудь", [bench], 4200), sess(3, 3, "Грудь 2", [bench], 4200),
      sess(4, 20, "Старая", [squat(10, 50)], 1800), sess(5, 100, "Давняя", [squat(10, 50)], 1800),
    ], log: [{ date: dayStr(1), p: "start", d: "d1", points: 20, t: "День 1" }] };
    const { w, errors } = boot({ state }); await tick(60);
    await go(w, "#/stats");
    const kw = $$(w, ".kpis3 .kv").map(e => e.textContent.replace(/ /g, " "));
    ok(kw[0] === "4" && kw[1] === "3 ч 20 мин" && kw[2] === "10,4 т", "неделя: 3 записи и 1 отметка = 4 тренировки, 200 минут, 10,4 т (4000 + 3200 + 3200 кг): " + kw.join(" | "));
    ok(/1 из них отмечены без записи подходов/.test(text(w, "main")), "сказано, что отмеченная тренировка без веса и времени");
    ok($$(w, ".mz.lv-4").length >= 2, "жим гантелей 32 подхода за неделю: грудь на золоте");
    ok(/Золото: [1-9]/.test(text(w, ".lv-legend")), "легенда считает золотые мышцы: " + text(w, ".lv-legend"));
    click(w, $(w, '.stat-figs .mz[data-m="chest"]'));
    ok(/Грудь: Золото, 32 подходов \(32 в неделю\)/.test(text(w, "#mcap")), "подпись: " + text(w, "#mcap"));
    ok($$(w, ".card svg.bars").length === 2, "два графика по неделям");
    ok(/Нагрузка по мышцам/.test(text(w, "main")) && $$(w, ".mrow").length >= 4, "список нагрузки по мышцам");
    ok($$(w, 'main a[href^="#/session/"]').length === 5, "в истории пять записанных тренировок");
    await go(w, "#/stats/month");
    ok($$(w, ".kpis3 .kv")[0].textContent === "5" && $(w, '.seg-b[href="#/stats/month"]').classList.contains("on"), "месяц: 5 тренировок, вкладка отмечена");
    ok($$(w, ".mz.lv-4").length === 0, "за месяц подходов в неделю меньше: золота нет");
    await go(w, "#/stats/year");
    ok($$(w, ".kpis3 .kv")[0].textContent === "6", "год: 6 тренировок");
    await go(w, "#/stats/all");
    ok($$(w, ".kpis3 .kv")[0].textContent === "6", "всё время: 6 тренировок");
    await go(w, "#/stats/нет-такого");
    ok($(w, '.seg-b[href="#/stats/week"]').classList.contains("on"), "неверный период открывается как неделя");
    ok(errors.length === 0, "без ошибок " + errors.join(" | "));
  }

  // 7. Пустая статистика и испорченные данные
  {
    const e = boot({}); await tick(60); await go(e.w, "#/stats");
    ok(/Пока нет тренировок/.test(text(e.w, "main")) && !$(e.w, ".stat-figs") && $$(e.w, ".kpis3 .kv")[0].textContent === "0", "пустая статистика: приглашение записать первую");
    for (const bad of [{ sessions: "строка" }, { sessions: [null, 5, { id: 1 }, { id: "x", date: "плохо", items: [] }, { id: "ok", date: dayStr(0), items: [{ ex: "squat", name: "П", sets: [{ reps: "много", kg: -5 }] }] }] }, { sessions: [{ id: "a", date: dayStr(0), items: [{ ex: "squat", name: "П", sets: [{ reps: 5, kg: 1e9 }] }], durationSec: -100 }] }, { draft: { id: 5 } }, { draft: { id: "d", startedAt: 1, items: [null, { ex: "x", name: "Y", sets: "нет" }] } }]) {
      const b = boot({ state: bad }); await tick(60); await go(b.w, "#/stats"); await go(b.w, "#/log"); await go(b.w, "#/");
      ok(b.errors.length === 0 && /Привет/.test(text(b.w, "h1")), "испорченные данные " + JSON.stringify(bad).slice(0, 50) + ": приложение работает " + b.errors.join(" | "));
    }
    const lim = boot({ state: { sessions: [{ id: "a", date: dayStr(0), durationSec: 60, title: "Т", items: [{ ex: "squat", name: "П", sets: [{ reps: 5, kg: 1e9 }] }] }] } }); await tick(60);
    await go(lim.w, "#/stats");
    ok(/^5 т$/.test($$(lim.w, ".kpis3 .kv")[2].textContent.replace(/\u00A0/g, " ")), "нереальный вес 1 000 000 000 ограничен 1000 кг на подход: 5 повторений × 1000 = 5 т: " + text(lim.w, ".kpis3"));
  }

  // 8. Отправка на сервер, повтор без сети, подгрузка на новом устройстве
  {
    let up = false, posted = [], serverSessions = [];
    const routes = (m, p, b) => {
      if (p === "/api/me" && m === "GET") return ME;
      if (p === "/api/sessions" && m === "POST") { if (!up) return { status: 0 }; posted.push(b); return { status: 201, body: { id: b.id } }; }
      if (p.startsWith("/api/sessions") && m === "GET") return { status: 200, body: { items: serverSessions } };
      if (p === "/api/workouts" && m === "POST") return { status: 201, body: { bonus: 0 } };
    };
    const a = boot({ routes }); await tick(80);
    await go(a.w, "#/log"); click(a.w, $(a.w, "#lblank")); await tick(10);
    type(a.w, $(a.w, "#lsearch"), "присед"); await tick(10); click(a.w, $(a.w, "#lres [data-add]")); await tick(10);
    type(a.w, $(a.w, '[data-i="0"][data-s="0"][data-f="reps"]'), "5"); type(a.w, $(a.w, '[data-i="0"][data-s="0"][data-f="kg"]'), "100");
    click(a.w, $(a.w, "#lfinish")); await tick(10); click(a.w, $(a.w, "#lsave")); await tick(80);
    ok(a.calls.filter(c => c.path === "/api/sessions" && c.method === "POST").length === 1 && stateOf(a.w).sessions[0].pending === true, "сервер не ответил: тренировка помечена «ждёт отправки»");
    ok(/ждёт отправки на сервер/.test(text(a.w, "main")), "и на странице тренировки об этом сказано");
    up = true;
    const saved = a.w.localStorage.getItem("fitwatch.v1");
    const b = boot({ state: saved, routes }); await tick(150);
    ok(posted.length === 1 && !stateOf(b.w).sessions[0].pending, "при следующем открытии отправлена и пометка снята");
    const body = posted[0];
    ok(/^[0-9a-f-]{36}$/.test(body.id) && body.items[0].ex === "squat" && body.items[0].sets[0].reps === 5 && body.items[0].sets[0].kg === 100 && body.durationSec >= 60 && /^\d{4}-\d{2}-\d{2}$/.test(body.day) && !("pending" in body) && !("tonnage" in body), "на сервер уходит только нужное: id, день, длительность, упражнения и подходы (тоннаж считает сервер)");
    ok(!/sets"?:\[\{"reps":5,"kg":100,"hint"/.test(JSON.stringify(body)), "подсказки полей на сервер не уходят");
    // новое устройство: тренировки с сервера добавляются, существующие не дублируются
    serverSessions = [{ id: body.id, date: body.day, durationSec: 60, title: "Дубль", items: body.items }, sess(77, 1, "С другого телефона", [{ ex: "db_bench", name: "Жим", sets: [{ reps: 8, kg: 30 }] }], 2400)];
    const c = boot({ routes }); await tick(150);
    const cs = stateOf(c.w).sessions;
    ok(cs.length === 2 && cs.some(s => s.title === "С другого телефона") && cs.filter(s => s.id === body.id).length === 1, "на новом устройстве подтянута тренировка с сервера, дубль не создан");
    // удаление тоже уходит на сервер
    let deleted = null;
    const d = boot({ state: { sessions: [sess(88, 0, "Удаляемая", [{ ex: "squat", name: "П", sets: [{ reps: 5, kg: 50 }] }], 600)] }, routes: (m, p, bb) => { if (m === "DELETE" && p.startsWith("/api/sessions/")) { deleted = p; return { status: 200, body: { ok: true } }; } return routes(m, p, bb); } }); await tick(150);
    await go(d.w, "#/session/" + UID(88)); click(d.w, $(d.w, "#ldel")); await tick(40);
    ok(deleted === "/api/sessions/" + UID(88), "удаление записи уходит на сервер");
  }

  // 9. Отправка тренеру в чат
  {
    const link = { id: 7, role: "client", status: "active", with: { name: "Тренер Марат" } };
    let sent = null;
    const routes = (m, p, b) => {
      if (p === "/api/me" && m === "GET") return ME;
      if (p === "/api/links" && m === "GET") return { status: 200, body: { items: [link] } };
      if (p === "/api/links/7/messages" && m === "POST") { sent = b; return { status: 201, body: { id: 1 } }; }
      if (p.startsWith("/api/sessions") && m === "GET") return { status: 200, body: { items: [] } };
    };
    const state = { sessions: [sess(90, 0, "Грудь", [{ ex: "db_bench", name: "Жим гантелей лёжа", sets: [{ reps: 8, kg: 30 }, { reps: 8, kg: 32.5 }, { reps: 6, kg: 0 }] }], 3300)] };
    const { w } = boot({ state, routes }); await tick(100);
    await go(w, "#/session/" + UID(90), 120);
    ok(!!$(w, "#lsendbtn") && /Отправить тренеру Тренер Марат/.test(text(w, "#lsend")), "у вошедшего с тренером есть кнопка «Отправить тренеру Тренер Марат»");
    click(w, $(w, "#lsendbtn")); await tick(60);
    ok(sent && /^Тренировка \d{2}\.\d{2}: Грудь\nЖим гантелей лёжа: 8×30, 8×32,5, 6 повт\.\nИтого: 3 подходов, 500 кг, 55 мин\.$/.test(sent.body), "в чат ушёл текст с подходами и итогом: " + JSON.stringify(sent && sent.body));
    ok(/Отправлено в чат/.test(text(w, "#lsmsg")) && $(w, "#lsendbtn").disabled, "кнопка сообщает об отправке и не даёт отправить дважды");
    const none = boot({ state, routes: (m, p, b) => (p === "/api/links" ? { status: 200, body: { items: [] } } : routes(m, p, b)) }); await tick(100);
    await go(none.w, "#/session/" + UID(90), 120);
    ok(!$(none.w, "#lsendbtn") && /Тренера пока нет/.test(text(none.w, "#lsend")), "без тренера: подсказка выбрать его в разделе «Тренеры»");
  }

  // 10. Не все записывают подходы: отметка программы и быстрая отметка мышц тоже окрашивают фигуру (примерно)
  {
    const { w } = boot({ state: { log: [{ date: dayStr(1), p: "start", d: "d1", points: 20, t: "День 1 — знакомство" }] } }); await tick(60);
    await go(w, "#/stats/week", 80);
    ok(!/Пока нет тренировок/.test(text(w, "main")) && /Тренировок/.test(text(w, ".kpis3")) && $(w, ".kpis3 .kv").textContent === "1", "отметка готовой программы даёт 1 тренировку");
    ok($$(w, ".stat-figs .mz.lv-1").length > 0, "мышцы приседаний и планки окрашены по программе (Дерево)");
    ok(/посчитана примерно/.test(text(w, "main")) && /веса и времени у них нет/.test(text(w, "main")), "экран честно говорит, что нагрузка посчитана примерно");
    const m = $(w, '.stat-figs [data-m="quads"]'); click(w, m);
    ok(/примерно 3 по отметкам/.test(text(w, "#mcap")), "подпись мышцы: сколько подходов из отметок: " + text(w, "#mcap"));
    ok(!!$(w, 'a[href="#/quick"]'), "на экране статистики есть «Просто отметить мышцы»");
  }
  {
    const { w } = boot({ state: {} }); await tick(60);
    await go(w, "#/stats/week", 60);
    ok(/Пока нет тренировок/.test(text(w, "main")) && /Просто отметить мышцы/.test(text(w, "main")), "пустая статистика называет три способа, включая быструю отметку");
    await go(w, "#/quick", 60);
    ok(w.document.getElementById("qsave").disabled === true, "без выбранных мышц кнопка выключена");
    click(w, $(w, '#qmus [data-m="chest"]')); click(w, $(w, '#qmus [data-m="shoulders"]'));
    ok(!w.document.getElementById("qsave").disabled && /Выбрано мышц: 2/.test(text(w, "#qhint")), "выбраны две мышцы, кнопка включена");
    ok($$(w, "#qdays [data-d]").length === 7, "можно выбрать любой из последних 7 дней");
    click(w, $(w, '#qdays [data-d="' + dayStr(1) + '"]')); click(w, w.document.getElementById("qsave")); await tick(60);
    const st = stateOf(w), e = st.log[0];
    ok(st.log.length === 1 && e.p === "quick" && e.date === dayStr(1) && e.muscles.join() === "chest,shoulders" && /грудь, плечи/.test(e.t), "отметка за вчера сохранена: " + JSON.stringify(e));
    ok(w.location.hash === "#/stats" || w.location.hash.startsWith("#/stats"), "после отметки открывается статистика");
    await go(w, "#/stats/week", 80);
    ok($(w, ".kpis3 .kv").textContent === "1" && $$(w, ".stat-figs .mz.lv-1").length > 0, "в статистике 1 тренировка, мышцы окрашены");
    await go(w, "#/quick", 60);
    ok($$(w, "#qdays [data-d]").length === 6 && !$(w, '#qdays [data-d="' + dayStr(1) + '"]'), "день, в который уже есть тренировка, второй раз не предлагается");
  }
  {
    const { w } = boot({ state: { log: Array.from({ length: 7 }, (_, i) => ({ date: dayStr(i), p: "start", d: "d1", points: 20, t: "x" })) } }); await tick(60);
    await go(w, "#/quick", 60);
    ok(!w.document.getElementById("qsave") && /каждый день уже есть тренировка/.test(text(w, "main")), "если все 7 дней заняты, об этом сказано, а кнопки нет");
  }

  console.log(`\nпроверок: ${n}, не прошло: ${failed}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("СБОЙ СЦЕНАРИЯ:", e); process.exit(2); });

function inputPlaceholders(w) { return $$(w, ".lg-set input").map(i => i.getAttribute("placeholder")); }
