// Пошаговая тренировка, оценка тяжести, задания от тренера, тело на главной. jsdom, сервер подменён.
// Запуск: npm i --no-save jsdom && node test-ui/go-flow.js.
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
  const lite = { mode: "pro", onboarded: true, welcomeOff: true };
  // 1. Из дня программы: черновик создаётся, разминка, подходы одним нажатием, отдых, итог с оценкой тяжести
  {
    const { w, errors } = boot({ state: {}, ui: lite }); await tick(60);
    await go(w, "#/", 80);
    ok(!!$(w, '.card.today a[href="#/go/start/d1"]') && /Начать по шагам/.test(text(w, ".card.today")), "на карточке «Сегодня» есть «Начать по шагам»");
    await go(w, "#/go/start/d1", 150);
    ok(w.location.hash === "#/go" && /Разминка/.test(text(w, "h1")) && $$(w, 'main a[href^="#/x/"]').length === 3, "из дня программы открывается разминка с тремя движениями");
    ok(stateOf(w).draft && stateOf(w).draft.src.d === "d1" && stateOf(w).draft.items.length === 2, "черновик создан из дня программы");
    click(w, w.document.getElementById("gskipwarm")); await tick(60);
    ok(/Упражнение 1 из 2/.test(text(w, "main")) && /Приседания/.test(text(w, "h1")) && !!$(w, ".go-fig svg .mz.on"), "первое упражнение: название и подсвеченная на теле мышца");
    ok(!!$(w, ".go-ex a[href^='#/x/']") && !!$(w, "details.card"), "есть ссылка «Как выполнять» и подсказка, где почувствовать мышцу");
    click(w, w.document.getElementById("gdone")); await tick(60);
    ok(/Подход 2 сделан/.test(text(w, "#gdone")), "после подхода кнопка предлагает отметить следующий");
    let sets = stateOf(w).draft.items[0].sets;
    ok(sets[0].done === true && sets[0].reps === "10", "один тап: повторения взяты из плана (10), подход отмечен");
    ok(!!$(w, ".go-rest") && /\d:\d\d/.test(text(w, "#grtime")), "после подхода идёт таймер отдыха");
    click(w, w.document.getElementById("gnorest")); await tick(20);
    ok(!$(w, ".go-rest"), "отдых можно пропустить");
    type(w, $(w, 'input[data-s="1"][data-f="reps"]'), "9"); type(w, $(w, 'input[data-s="1"][data-f="kg"]'), "20");
    click(w, w.document.getElementById("gdone")); await tick(40); click(w, w.document.getElementById("gdone")); await tick(40);
    ok(!!w.document.getElementById("gnext") && /Дальше: Планка/.test(text(w, "#gnext")), "все подходы отмечены: «Дальше: Планка»");
    click(w, w.document.getElementById("gnext")); await tick(60);
    ok(/Упражнение 2 из 2/.test(text(w, "main")), "второе упражнение");
    ok(!!$(w, "#gprev"), "на втором упражнении есть возврат к предыдущему");
    click(w, w.document.getElementById("gskip")); await tick(60);
    ok(/Готово/.test(text(w, "h1")) && !!w.document.getElementById("gmin") && $$(w, "#grpe [data-rpe]").length === 4, "итог: минуты и выбор тяжести");
    click(w, $(w, '#grpe [data-rpe="9"]'));
    ok($(w, '#grpe [data-rpe="9"]').getAttribute("aria-pressed") === "true", "тяжесть «Тяжело» выбрана");
    click(w, w.document.getElementById("gsave")); await tick(80);
    const s = stateOf(w).sessions[0];
    ok(w.location.hash.startsWith("#/session/") && stateOf(w).sessions.length === 1 && s.rpe === 9 && s.items.length === 1, "сохранено: одна тренировка с подходами и тяжестью 9; пропущенное упражнение без подходов не попало");
    ok(stateOf(w).draft === null || stateOf(w).draft === undefined, "черновик закрыт");
    ok(/Тяжесть: 9 из 10/.test(text(w, "main")), "на итоговом экране видна тяжесть");
    ok(errors.length === 0, "ошибок скриптов нет: " + errors.join("|"));
  }
  // 2. Цель на следующий раз учитывает тяжесть
  {
    const mk = (rpe, reps, kg) => sess(1, 3, "Грудь", [{ ex: "db_bench", name: "Жим гантелей лёжа", sets: [{ reps, kg }] }], 1800);
    const hard = Object.assign(mk(9, 10, 24), { rpe: 9 }), easy = Object.assign(mk(4, 10, 24), { rpe: 4 }), plain = mk(0, 10, 24);
    for (const [name, s, re] of [["тяжело", hard, /Цель: 10 × 24 кг.*Было тяжело, повтори то же/], ["легко", easy, /Цель: 10 × 26,5 кг.*Было легко, добавь вес/], ["без оценки", plain, /Цель: 11 × 24 кг/]]) {
      const { w } = boot({ state: { sessions: [s] }, ui: lite }); await tick(60);
      await go(w, "#/log/ex/db_bench", 100);
      ok(re.test($(w, ".lg-goal").textContent.replace(/\s+/g, " ")), "цель после тренировки «" + name + "»: " + $(w, ".lg-goal").textContent.replace(/\s+/g, " "));
    }
  }
  // 3. Задания от тренера: главная, список, выполнение
  {
    const asg = { id: 5, title: "Грудь и трицепс", note: "Отдых 90 секунд", trainer: "Марат", status: "new", createdAt: "2026-11-01T10:00:00Z", items: [{ ex: "db_bench", name: "Жим гантелей лёжа", sets: 3, reps: "8–10" }, { ex: "pushup", name: "Отжимания", sets: 2, reps: "12" }] };
    let doneCall = null, served = [asg];
    const routes = (m, p, b) => {
      if (p === "/api/me" && m === "GET") return ME;
      if (p === "/api/assignments" && m === "GET") return { status: 200, body: { items: served } };
      if (p === "/api/assignments/5/done" && m === "POST") { doneCall = b; served = [Object.assign({}, asg, { status: "done" })]; return { status: 200, body: { ok: true } }; }
      if (p.startsWith("/api/sessions")) return m === "GET" ? { status: 200, body: { items: [] } } : { status: 201, body: { id: "x" } };
      if (p.startsWith("/api/workouts") || p.startsWith("/api/history")) return { status: 201, body: {} };
    };
    const { w } = boot({ state: {}, ui: lite, routes }); await tick(120);
    await go(w, "#/", 150);
    ok(!!$(w, "#asgslot .card") && /Грудь и трицепс/.test(text(w, "#asgslot")) && /Марат/.test(text(w, "#asgslot")), "на главной карточка «Тренер назначил»");
    await go(w, "#/assigned", 150);
    ok(/Отдых 90 секунд/.test(text(w, "main")) && /Жим гантелей лёжа: 3 × 8–10/.test(text(w, "main")) && !!$(w, 'a[href="#/go/assigned/5"]'), "список заданий: заметка, упражнения, кнопка запуска");
    await go(w, "#/go/assigned/5", 200);
    const d = stateOf(w).draft;
    ok(w.location.hash === "#/go" && d && d.title === "Грудь и трицепс" && d.src.p === "trainer" && d.src.d === "5" && d.items.length === 2 && d.items[0].sets.length === 3 && d.note === "Отдых 90 секунд", "задание стало черновиком: упражнения, подходы, заметка");
    click(w, w.document.getElementById("gskipwarm")); await tick(60);
    ok(/Заметка тренера/.test(text(w, "main")) && /Отдых 90 секунд/.test(text(w, "main")), "заметка тренера видна во время тренировки");
    click(w, w.document.getElementById("gdone")); await tick(40);
    click(w, w.document.getElementById("gnorest")); await tick(20);
    for (let i = 0; i < 2; i++) { click(w, w.document.getElementById("gdone")); await tick(30); }
    click(w, w.document.getElementById("gskip")); await tick(60); click(w, w.document.getElementById("gskip")); await tick(60);
    click(w, w.document.getElementById("gsave")); await tick(150);
    const sess1 = stateOf(w).sessions[0];
    ok(sess1 && doneCall && doneCall.sessionId === sess1.id, "после сохранения клиент отметил задание выполненным, ушёл id тренировки");
    ok(sess1.program === "trainer" && sess1.dayId === "5", "тренировка помечена как задание тренера");
    await go(w, "#/assigned", 150);
    ok(/Выполнено/.test(text(w, "main")) && !$(w, 'a[href="#/go/assigned/5"]'), "выполненное задание нельзя начать второй раз");
    const anon = boot({ state: {}, ui: lite }); await tick(80);
    await go(anon.w, "#/assigned", 100);
    ok(/войди в аккаунт/.test(text(anon.w, "main")), "без входа страница заданий предлагает войти");
  }
  // 4. Тело на главной: со ступени 2, по нагрузке; на ступени 1 его нет
  {
    const s1 = boot({ state: {}, ui: lite }); await tick(60);
    await go(s1.w, "#/", 80);
    ok(!$(s1.w, ".body-card"), "новичку без тренировок тело на главной не показывается");
    const heavy = [sess(61, 1, "Грудь", [{ ex: "db_bench", name: "Жим", sets: Array.from({ length: 8 }, () => ({ reps: 10, kg: 24 })) }], 3000)];
    const s2 = boot({ state: { sessions: heavy }, ui: lite }); await tick(60);
    await go(s2.w, "#/", 80);
    ok(!!$(s2.w, ".body-card") && $$(s2.w, ".body-card .mz[class*='lv-']").length > 0 && $(s2.w, ".body-card").getAttribute("href") === "#/stats/week", "со ступени 2 на главной тело недели с уровнями мышц, ведёт в статистику");
    ok(/Спину и бицепс|Ноги почти|нет нагрузки/.test(text(s2.w, ".body-card")), "под телом одна подсказка тренера");
  }
  console.log(`\nпроверок: ${n}, не прошло: ${failed}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("СБОЙ СЦЕНАРИЯ:", e); process.exit(2); });
