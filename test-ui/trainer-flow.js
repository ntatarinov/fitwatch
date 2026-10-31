// Сквозная проверка тренеров, тарифов и закрытых программ: четыре «браузера» (администратор, тренер, клиент, посторонний)
// работают через интерфейс с общей базой PGlite. Запуск: npm i --no-save jsdom @electric-sql/pglite && node test-ui/trainer-flow.js
process.env.ADMIN_EMAILS = "admin@test.kz"; // прав не даёт: администратор задаётся по ID аккаунта (ниже)
const fs = require("fs"), path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");
const ROOT = path.join(__dirname, "..");
const { handle } = require(path.join(ROOT, "api/_lib/app.js"));
const { migrate } = require(path.join(ROOT, "api/_lib/db.js"));

let n = 0, failed = 0;
const ok = (c, name) => { n++; if (!c) { failed++; console.log("FAIL:", name); } else console.log("ok  :", name); };
const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));
const until = async (f, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (f()) return true; } catch (e) { /* ждём */ } await tick(15); } return false; };

function openApp(db, ip) {
  let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => "<script>" + fs.readFileSync(path.join(ROOT, src), "utf8").replace(/<\/script>/g, "<\\/script>") + "</script>");
  const errors = [], vc = new VirtualConsole();
  vc.on("jsdomError", e => errors.push(String(e.stack || e).split("\n")[0])); vc.on("error", e => errors.push(String(e)));
  const jar = {}; // несколько cookie, как в браузере
  const cookieHeader = () => Object.keys(jar).map(k => k + "=" + jar[k]).join("; ");
  const dom = new JSDOM(html, {
    url: "http://localhost/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      try { w.localStorage.setItem("fitwatch.ui", JSON.stringify({ mode: "pro", onboarded: true, welcomeOff: true })); } catch (e) { /* без хранилища */ } 
      w.scrollTo = () => {}; w.HTMLCanvasElement.prototype.getContext = () => null;
      w.fetch = async (url, init) => {
        init = init || {};
        const u = new URL(url, "http://localhost"), headers = { host: "localhost", "x-forwarded-for": ip };
        Object.keys(init.headers || {}).forEach(k => { headers[k.toLowerCase()] = init.headers[k]; });
        if (cookieHeader()) headers.cookie = cookieHeader();
        const res = await handle({ method: init.method || "GET", path: u.pathname, query: Object.fromEntries(u.searchParams), body: init.body ? JSON.parse(init.body) : undefined, headers }, { db });
        (res.cookies || []).forEach(sc => { const kv = sc.split(";")[0], i = kv.indexOf("="), k = kv.slice(0, i), v = kv.slice(i + 1); if (v === "" || /Max-Age=0\b/.test(sc)) delete jar[k]; else jar[k] = v; });
        return { ok: res.status < 400, status: res.status, json: async () => res.body };
      };
    },
  });
  dom.window.alert = () => {}; dom.window.confirm = () => true;
  return { w: dom.window, errors };
}
const $ = (w, s) => w.document.querySelector(s), $$ = (w, s) => Array.from(w.document.querySelectorAll(s));
const text = (w, s) => ($(w, s) || { textContent: "" }).textContent;
const go = async (w, h) => { w.location.hash = h; await tick(60); };
const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const submit = (w, form) => form.dispatchEvent(new w.Event("submit", { cancelable: true, bubbles: true }));
// Повторное открытие той же страницы: сначала уходим на главную (браузер не перерисовывает тот же адрес).
const reopen = async (w, h) => { w.location.hash = "#/"; await tick(40); await go(w, h); };
const change = (w, el) => el.dispatchEvent(new w.Event("change", { bubbles: true }));
async function register(w, name, email) {
  await go(w, "#/account/register");
  const f = $(w, "#acform").elements; f.name.value = name; f.email.value = email; f.password.value = "password-123"; f.consent.checked = true;
  submit(w, $(w, "#acform"));
  await until(() => w.Account.state.status === "user");
}

(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite();
  const db = { query: async (t, p) => (await pg.query(t, p || [])).rows };
  await migrate(db);
  const adm = openApp(db, "10.5.0.1"), trn = openApp(db, "10.5.0.2"), cli = openApp(db, "10.5.0.3"), str = openApp(db, "10.5.0.4");
  await tick(100);
  await register(adm.w, "Админ", "admin@test.kz"); await register(trn.w, "Тренер Марат", "marat@test.kz");
  await register(cli.w, "Клиент Дана", "dana@test.kz"); await register(str.w, "Посторонний", "stranger@test.kz");
  ok(adm.w.Account.state.user.isAdmin === false, "почта из ADMIN_EMAILS сама по себе прав администратора не даёт");
  process.env.ADMIN_USER_IDS = (await db.query("SELECT id FROM users WHERE email = 'admin@test.kz'"))[0].id;
  await adm.w.Account.refresh();
  ok(adm.w.Account.state.user.isAdmin === true && cli.w.Account.state.user.isAdmin === false, "администратор определяется по ID аккаунта из настроек");

  // ---- заявка тренера и подтверждение ----
  await go(trn.w, "#/trainers");
  ok(await until(() => !!$(trn.w, "#apply")), "тренер: форма заявки");
  const ap = $(trn.w, "#apply").elements; ap.bio.value = "коротко"; submit(trn.w, $(trn.w, "#apply"));
  ok(await until(() => /от 20 до 1000/.test(text(trn.w, "#aerr"))), "тренер: короткое описание отклонено");
  $(trn.w, "#apply").elements.bio.value = "Тренер по силовым, 8 лет опыта, работаю с новичками."; $(trn.w, "#apply").elements.spec.value = "сила, масса";
  submit(trn.w, $(trn.w, "#apply"));
  ok(await until(() => /на проверке/.test(text(trn.w, "main"))), "тренер: заявка на проверке");
  await go(cli.w, "#/admin"); ok(/Нет доступа/.test(text(cli.w, "main")), "клиенту панель администратора недоступна");
  await go(adm.w, "#/admin");
  ok(await until(() => /Заявки тренеров \(1\)/.test(text(adm.w, "main")) && /Тренер Марат/.test(text(adm.w, "main"))), "администратор видит заявку");
  click(adm.w, $(adm.w, '[data-v="approve"]'));
  ok(await until(() => /Заявки тренеров \(0\)/.test(text(adm.w, "main"))), "администратор подтвердил тренера");
  const pf = $(adm.w, "#pform").elements; pf.tier.value = "premium"; pf.days.value = "30"; pf.max.value = "2"; pf.code.value = "e2e-prem";
  submit(adm.w, $(adm.w, "#pform"));
  ok(await until(() => /E2E-PREM/.test(text(adm.w, "main"))), "администратор создал код «Премиум»");
  const pf2 = $(adm.w, "#pform").elements; pf2.tier.value = "personal"; pf2.days.value = "30"; pf2.max.value = "1"; pf2.code.value = "e2e-pers";
  submit(adm.w, $(adm.w, "#pform"));
  ok(await until(() => /E2E-PERS/.test(text(adm.w, "main"))), "администратор создал код «Персональный тренер»");

  // ---- тариф и закрытые программы ----
  await go(cli.w, "#/premium");
  ok(await until(() => $$(cli.w, 'a.card[href="#/tariffs"]').length >= 4 && /по подписке/.test(text(cli.w, "main"))), "бесплатный клиент: все программы закрыты");
  await go(cli.w, "#/pp/mass4");
  ok(await until(() => /открывается по подписке/.test(text(cli.w, "main"))) && !/Жим гантелей/.test(text(cli.w, "main")), "содержимое закрытой программы не показано");
  await go(cli.w, "#/tariffs");
  ok(await until(() => /Сейчас: Бесплатный/.test(text(cli.w, "main"))), "тарифы: бесплатный");
  $(cli.w, "#promo").elements.code.value = "no-such"; submit(cli.w, $(cli.w, "#promo"));
  ok(await until(() => /не найден/.test(text(cli.w, "#perr"))), "неверный код отклонён");
  $(cli.w, "#promo").elements.code.value = "E2E-PREM"; submit(cli.w, $(cli.w, "#promo"));
  ok(await until(() => /Сейчас: Премиум/.test(text(cli.w, "main"))), "промокод дал «Премиум»");
  await go(cli.w, "#/premium");
  ok(await until(() => $$(cli.w, 'a.card[href^="#/pp/"]').length === 4), "премиум: открыты 4 программы");
  await go(cli.w, "#/pp/mass4");
  ok(await until(() => !!$(cli.w, "#wk")) && /Неделя 1/.test(text(cli.w, "main")) && /3 × 12/.test(text(cli.w, "main")), "программа: неделя 1, 3 × 12");
  $(cli.w, "#wk").value = "4"; change(cli.w, $(cli.w, "#wk"));
  ok(await until(() => /4 × 10/.test(text(cli.w, "main"))), "программа: неделя 4, нагрузка выросла до 4 × 10");
  await go(cli.w, "#/ppd/mass4/d1");
  ok(await until(() => !!$(cli.w, "#done")) && $$(cli.w, ".card .pill").length >= 6, "день программы открылся");
  click(cli.w, $(cli.w, "#done")); await tick(250);
  const wk = (await db.query("SELECT program, day_id FROM workouts w JOIN users u ON u.id = w.user_id WHERE u.email = 'dana@test.kz'"))[0];
  ok(wk && wk.program === "pp-mass4" && wk.day_id === "d1", "тренировка по расширенной программе записана на сервере");

  // ---- запрос тренеру и чат ----
  await go(cli.w, "#/trainers");
  ok(await until(() => /Тренер Марат/.test(text(cli.w, "main")) && /Нужна подписка «Персональный тренер»/.test(text(cli.w, "main"))) && !$(cli.w, "[data-req]"), "с «Премиум» запрос тренеру закрыт: нужна подписка «Персональный тренер»");
  await go(cli.w, "#/tariffs");
  await until(() => !!$(cli.w, "#promo"));
  $(cli.w, "#promo").elements.code.value = "E2E-PERS"; submit(cli.w, $(cli.w, "#promo"));
  ok(await until(() => /Сейчас: Персональный тренер/.test(text(cli.w, "main"))), "клиент получил «Персональный тренер»");
  await cli.w.Account.saveProfile({ goal: "muscle", level: 2, days: 4, minutes: 45, place: "gym", limits: ["knees"] });
  await go(cli.w, "#/trainers");
  ok(await until(() => !!$(cli.w, "[data-req]")), "появилась кнопка «Запросить»");
  $(cli.w, "[data-note]").value = "Хочу набрать массу"; click(cli.w, $(cli.w, "[data-req]"));
  ok(await until(() => /Ждёт ответа/.test(text(cli.w, "main"))), "запрос отправлен");
  await go(str.w, "#/trainers");
  ok(await until(() => /Нужна подписка «Персональный тренер»/.test(text(str.w, "main"))), "посторонний без тарифа не может запросить тренера");
  await go(trn.w, "#/coach");
  ok(await until(() => /Новые запросы \(1\)/.test(text(trn.w, "main")) && /Хочу набрать массу/.test(text(trn.w, "main"))), "тренер видит запрос с сообщением клиента");
  click(trn.w, $(trn.w, '[data-act="accept"]'));
  ok(await until(() => $$(trn.w, ".client").length === 1 && /Мои клиенты/.test(text(trn.w, "main"))), "тренер принял запрос: клиент в списке");
  const linkId = $(trn.w, 'a[href^="#/chat/"]').getAttribute("href").split("/")[2];
  await go(trn.w, "#/chat/" + linkId);
  ok(await until(() => !!$(trn.w, "#mform")), "тренер открыл чат");
  $(trn.w, "#mform").elements.body.value = "Здравствуйте, Дана! Расскажите про опыт тренировок."; submit(trn.w, $(trn.w, "#mform"));
  ok(await until(() => /Здравствуйте, Дана/.test(text(trn.w, "#msgs"))), "тренер: своё сообщение показано");
  await go(cli.w, "#/chat/" + linkId);
  ok(await until(() => /Здравствуйте, Дана/.test(text(cli.w, "#msgs"))) && $$(cli.w, ".msg.me").length === 0, "клиент видит сообщение тренера");
  $(cli.w, "#mform").elements.body.value = "Занимаюсь полгода, хочу план."; submit(cli.w, $(cli.w, "#mform"));
  ok(await until(() => $$(cli.w, ".msg.me").length === 1), "клиент ответил");
  await reopen(trn.w, "#/chat/" + linkId);
  ok(await until(() => /Занимаюсь полгода/.test(text(trn.w, "#msgs"))), "тренер видит ответ клиента");
  await go(str.w, "#/chat/" + linkId);
  ok(await until(() => /Не найдено/.test(text(str.w, "main"))), "посторонний не видит чужой чат");

  // ---- согласие на доступ к данным ----
  await reopen(trn.w, "#/client/" + linkId);
  ok(await until(() => /не открыл цели и ограничения/.test(text(trn.w, "main")) && /не открыл результаты/.test(text(trn.w, "main"))) && !$(trn.w, ".kpis"), "по умолчанию тренер ничего не видит");
  await go(cli.w, "#/chat/" + linkId);
  await until(() => !!$(cli.w, "#sg"));
  $(cli.w, "#sg").checked = true; change(cli.w, $(cli.w, "#sg")); await tick(150);
  await reopen(trn.w, "#/client/" + linkId);
  ok(await until(() => /Набор массы|Набрать мышечную массу/.test(text(trn.w, "main")) && /колени/i.test(text(trn.w, "main"))) && /не открыл результаты/.test(text(trn.w, "main")), "после согласия на цели тренер видит цели и ограничения, но не результаты");
  await go(cli.w, "#/chat/" + linkId);
  await until(() => !!$(cli.w, "#sr"));
  $(cli.w, "#sr").checked = true; change(cli.w, $(cli.w, "#sr")); await tick(150);
  await reopen(trn.w, "#/client/" + linkId);
  ok(await until(() => !!$(trn.w, ".kpis") && /Последние тренировки/.test(text(trn.w, "main")) && !/не открыл результаты/.test(text(trn.w, "main"))), "после согласия на результаты виден дашборд клиента");
  ok($$(trn.w, ".kpis .kpi").length === 4 && !!$(trn.w, "svg.bars") && /Тренировок за 7 дней/.test(text(trn.w, "main")), "в дашборде четыре показателя и график по неделям");
  ok($$(trn.w, ".wl").length === 1 && /\+\d+/.test(text(trn.w, ".wl")), "в дашборде одна последняя тренировка клиента, записанная на сервере");
  await go(cli.w, "#/chat/" + linkId);
  await until(() => !!$(cli.w, "#sg"));
  $(cli.w, "#sg").checked = false; change(cli.w, $(cli.w, "#sg")); $(cli.w, "#sr").checked = false; change(cli.w, $(cli.w, "#sr")); await tick(150);
  await reopen(trn.w, "#/client/" + linkId);
  ok(await until(() => /не открыл цели и ограничения/.test(text(trn.w, "main")) && /не открыл результаты/.test(text(trn.w, "main"))) && !$(trn.w, ".kpis"), "согласие отозвано: данные снова закрыты");

  // ---- кабинет с несколькими клиентами ----
  const cli2 = openApp(db, "10.5.0.5"), cli3 = openApp(db, "10.5.0.6");
  await tick(100);
  await register(cli2.w, "Клиент Алия", "aliya@test.kz"); await register(cli3.w, "Клиент Бек", "bek@test.kz");
  await db.query("INSERT INTO subscriptions(user_id, tier, until) SELECT id, 'personal', now() + interval '30 days' FROM users WHERE email IN ('aliya@test.kz','bek@test.kz')");
  const tid = (await cli2.w.Account.trainers()).data.items[0].id;
  ok((await cli2.w.Account.requestTrainer(tid, "Нужна помощь с питанием")).ok && (await cli3.w.Account.requestTrainer(tid, "")).ok, "ещё два клиента отправили запросы тренеру");
  await reopen(trn.w, "#/coach");
  ok(await until(() => /Новые запросы \(2\)/.test(text(trn.w, "main")) && /Нужна помощь с питанием/.test(text(trn.w, "main"))), "тренер видит два новых запроса");
  click(trn.w, $$(trn.w, '[data-act="accept"]')[0]);
  await until(() => /Новые запросы \(1\)/.test(text(trn.w, "main")));
  click(trn.w, $$(trn.w, '[data-act="accept"]')[0]);
  ok(await until(() => $$(trn.w, ".client").length === 3 && !/Новые запросы/.test(text(trn.w, "main"))), "тренер принял обоих: в списке три клиента");
  const aliyaLink = (await trn.w.Account.links()).data.items.find(l => l.with.name === "Клиент Алия").id;
  await cli2.w.Account.setShare(aliyaLink, { goals: true, results: true });
  await cli2.w.Account.saveProfile({ goal: "lose", level: 1, days: 3, minutes: 30, place: "home", limits: [] });
  const aid = (await db.query("SELECT id FROM users WHERE email = 'aliya@test.kz'"))[0].id;
  for (const ago of [0, 1, 3]) await db.query("INSERT INTO workouts(user_id, day, program, day_id, title, base_points, bonus_points) VALUES ($1, current_date - $2::int, 'plan', 'w1', 'Круговая', 20, 0)", [aid, ago]);
  for (const [ago, v] of [[30, 71.2], [3, 69.8]]) await db.query("INSERT INTO measurements(user_id, kind, value, measured_on) VALUES ($1, 'weight', $2, current_date - $3::int)", [aid, v, ago]);
  await reopen(trn.w, "#/coach");
  ok(await until(() => $$(trn.w, ".client").length === 3 && $$(trn.w, ".kpis .kpi").length === 4), "дашборд кабинета: три клиента и четыре показателя");
  const kv = $$(trn.w, ".kpis .kv").map(e => e.textContent);
  ok(kv[0] === "3" && kv[1] === "1 из 1" && kv[2] === "100%", "показатели: 3 клиента, 1 из 1 тренировался, регулярность 100%: " + kv.join("|"));
  ok(/2 клиента без доступа/.test(text(trn.w, ".kpis")), "видно, сколько клиентов не открыли результаты");
  ok($$(trn.w, ".client .cl-bars svg.mini").length === 1 && $$(trn.w, ".client .cl-lock").length === 2, "у клиента с доступом мини-график, у остальных замок");
  ok(!!$(trn.w, ".card svg.bars:not(.mini)") && /Тренировки клиентов по неделям/.test(text(trn.w, "main")), "общий график по неделям");
  click(trn.w, $$(trn.w, "#cfilters [data-f]").find(b => b.dataset.f === "locked"));
  ok(await until(() => $$(trn.w, ".client").length === 2 && !/Алия/.test(text(trn.w, "#clist"))), "фильтр «Нет доступа» оставляет двух клиентов");
  click(trn.w, $$(trn.w, "#cfilters [data-f]").find(b => b.dataset.f === "all"));
  await until(() => $$(trn.w, ".client").length === 3);
  const q = $(trn.w, "#cq"); q.value = "алия"; q.dispatchEvent(new trn.w.Event("input", { bubbles: true }));
  ok($$(trn.w, ".client").length === 1 && /Клиент Алия/.test(text(trn.w, "#clist")), "поиск по имени находит клиента");
  q.value = ""; q.dispatchEvent(new trn.w.Event("input", { bubbles: true }));
  await go(trn.w, "#/client/" + aliyaLink);
  ok(await until(() => !!$(trn.w, ".kpis")) && /Круговая/.test(text(trn.w, "main")) && /69.8 кг/.test(text(trn.w, ".kpis")) && /-1.4 кг/.test(text(trn.w, ".kpis")), "дашборд клиента: тренировки, вес 69.8 и изменение -1.4 кг");
  ok(/3 \/ 3/.test(text(trn.w, ".kpis")) && /регулярность 100%/.test(text(trn.w, ".kpis")), "3 из 3 тренировок недельной цели");
  ok(/Набрать|Похудеть/.test(text(trn.w, "main")) && !!$(trn.w, "svg.chart"), "цели и графики на месте");
  $(trn.w, "#tnote").value = "Начать с ходьбы, колени беречь."; click(trn.w, $(trn.w, "#nsave"));
  ok(await until(() => /Сохранено/.test(text(trn.w, "#nstat"))), "заметка тренера сохранена");
  await reopen(trn.w, "#/client/" + aliyaLink);
  ok(await until(() => $(trn.w, "#tnote") && $(trn.w, "#tnote").value === "Начать с ходьбы, колени беречь."), "после перезагрузки заметка на месте");
  await go(cli2.w, "#/chat/" + aliyaLink);
  ok(await until(() => !!$(cli2.w, "#mform")) && !/ходьбы/.test(text(cli2.w, "main")), "клиент заметку тренера не видит");
  await go(cli2.w, "#/coach");
  ok(await until(() => /подтверждённым тренерам/.test(text(cli2.w, "main"))), "клиенту кабинет тренера недоступен");
  await go(cli2.w, "#/client/" + aliyaLink);
  ok(await until(() => /Кабинет доступен|Не найдено|подтверждённым/.test(text(cli2.w, "main"))) && !$(cli2.w, ".kpis"), "клиенту дашборд клиента недоступен");

  // ---- завершение ----
  await go(cli.w, "#/trainers");
  await until(() => !!$(cli.w, "[data-end]"));
  click(cli.w, $(cli.w, "[data-end]"));
  ok(await until(() => /Завершён/.test(text(cli.w, "main"))), "клиент завершил связь");
  await go(trn.w, "#/chat/" + linkId);
  ok(await until(() => /только для чтения/.test(text(trn.w, "main"))) && !$(trn.w, "#mform"), "после завершения переписка только для чтения");

  // ---- роли: администратор назначает в панели ----
  await reopen(adm.w, "#/admin");
  ok(await until(() => $$(adm.w, "#ulist .card.user").length >= 5), "панель администратора: список пользователей");
  ok(/Администратор/.test(text(adm.w, "#ulist")) && /Тренер/.test(text(adm.w, "#ulist")) && /VIP/.test(text(adm.w, "#ulist")), "у пользователей видны роли: администратор, тренер, VIP");
  $(adm.w, "#uq").value = "Посторонний"; submit(adm.w, $(adm.w, "#ufind"));
  ok(await until(() => $$(adm.w, "#ulist .card.user").length === 1 && /Посторонний/.test(text(adm.w, "#ulist"))), "поиск по имени нашёл одного человека");
  ok(/Пользователь/.test(text(adm.w, "#ulist .roles")), "у него роль «Пользователь»");
  click(adm.w, $(adm.w, '#ulist [data-act="trainer-on"]'));
  ok(await until(() => /Тренер/.test(text(adm.w, "#ulist .roles")) && !!$(adm.w, '#ulist [data-act="trainer-off"]')), "«Сделать тренером»: роль появилась");
  $(adm.w, "#ulist [data-vip-tier]").value = "personal"; $(adm.w, "#ulist [data-vip-days]").value = "14";
  click(adm.w, $(adm.w, '#ulist [data-act="vip"]'));
  ok(await until(() => /VIP · Персональный тренер до/.test(text(adm.w, "#ulist .roles"))), "«Выдать VIP» на 14 дней");
  click(adm.w, $(adm.w, '#ulist [data-act="admin-on"]'));
  ok(await until(() => /Администратор/.test(text(adm.w, "#ulist .roles"))), "«Сделать администратором»");
  await str.w.Account.refresh();
  await reopen(str.w, "#/profile");
  ok(await until(() => /Панель администратора/.test(text(str.w, "main")) && /Кабинет тренера/.test(text(str.w, "main"))), "человек видит в профиле панель администратора и кабинет тренера");
  ok(/VIP · Персональный тренер/.test(text(str.w, "main .roles")) && str.w.document.getElementById("coachtab").hidden === false, "у него бейдж VIP и вкладка «Клиенты»");
  click(adm.w, $(adm.w, '#ulist [data-act="admin-off"]'));
  ok(await until(() => !$(adm.w, '#ulist [data-act="admin-off"]') && !!$(adm.w, '#ulist [data-act="admin-on"]')), "«Снять администратора»");
  click(adm.w, $(adm.w, '#ulist [data-act="vip-off"]'));
  ok(await until(() => !/VIP/.test(text(adm.w, "#ulist .roles"))), "«Снять VIP»: тариф бесплатный");
  click(adm.w, $(adm.w, '#ulist [data-act="trainer-off"]'));
  ok(await until(() => /Пользователь/.test(text(adm.w, "#ulist .roles"))), "«Снять тренера»: снова обычный пользователь");
  $(adm.w, "#uq").value = ""; submit(adm.w, $(adm.w, "#ufind"));
  click(adm.w, $$(adm.w, "#urole [data-role]").find(b => b.dataset.role === "admin"));
  ok(await until(() => $$(adm.w, "#ulist .card.user").length >= 1 && /это ты/.test(text(adm.w, "#ulist"))), "фильтр «Админы»: в списке ты");
  const meCard = $$(adm.w, "#ulist .card.user").find(c => /это ты/.test(c.textContent));
  ok(!meCard.querySelector('[data-act="admin-off"]'), "снять права с самого себя нельзя: кнопки нет");
  await go(cli.w, "#/admin");
  ok(await until(() => /Нет доступа/.test(text(cli.w, "main"))), "обычному пользователю панель недоступна");

  const errs = adm.errors.concat(trn.errors, cli.errors, str.errors, cli2.errors, cli3.errors);
  ok(errs.length === 0, "ошибок скриптов нет: " + errs.slice(0, 3).join(" | "));
  console.log(`\nпроверок: ${n}, не прошло: ${failed}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error("СБОЙ СЦЕНАРИЯ:", e); process.exit(2); });
