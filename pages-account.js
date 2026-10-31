// Страницы с сервером: аккаунт, рейтинг, «Мои данные» (вес и рост с графиком). Подключается до app.js.
(function () {
  "use strict";
  const P = (window.PAGES = window.PAGES || {});
  const A = () => window.Account;
  const rankMark = n => (n <= 3 ? `<span class="medal m${n}">${n}</span>` : String(n));
  const errText = r => (r.error === "offline" ? "Сервер недоступен" : r.error);

  const loading = FW => { FW.app.innerHTML = '<div class="card"><p class="muted">Загружаю…</p></div>'; };
  const offlineCard = '<div class="card"><b>Сервер данных ещё подключается</b><p class="muted">Приложение работает без входа: данные лежат на этом устройстве. Рейтинг, история веса и переписка с тренером появятся, когда сервер заработает.</p></div>';
  const ctaCard = (FW, text) => '<div class="card"><p>' + FW.esc(text) + '</p><a class="btn" href="#/account">Войти или зарегистрироваться</a></div>';

  // Подготовка только что созданного аккаунта: перенос цели, параметров и недавних тренировок из браузера.
  // При входе в уже существующий аккаунт ничего не переносится: иначе на общем устройстве данные одного человека попали бы к другому.
  async function afterAuth(FW, created) {
    const st = FW.state, acc = A();
    let added = 0;
    if (created) {
      if (st.me) await acc.saveProfile(acc.profileFromLocal(st.me));
      const items = acc.workoutsFromLog(st.log, FW.today());
      if (items.length) { const r = await acc.syncWorkouts(items); if (r.ok) added = r.data.added; }
    }
    await acc.refresh();
    if (added) window.FX.toast("Перенесено тренировок: " + added, "cloud");
  }
  // После входа: в рейтинг, если человек его включил; иначе в профиль.
  const afterAuthHref = () => (window.Guide && window.Guide.show("rating") ? "#/rating" : "#/profile");

  // Кнопка Telegram (новая схема входа Telegram, OpenID): библиотека Telegram открывает окно входа и отдаёт id_token,
  // сервер проверяет его подпись. Библиотека и одноразовое значение (nonce) готовятся заранее, чтобы окно открылось по нажатию.
  let tgLib = null;
  function loadTelegramLib() {
    if (window.Telegram && window.Telegram.Login) return Promise.resolve();
    if (!tgLib) tgLib = new Promise((ok, no) => {
      const sc = document.createElement("script");
      sc.src = "https://telegram.org/js/telegram-login.js?3"; sc.async = true;
      sc.onload = ok; sc.onerror = () => { tgLib = null; no(new Error("lib")); };
      document.head.appendChild(sc);
    });
    return tgLib;
  }
  async function mountTelegram(FW, box, mode) {
    const acc = A(), cfg = await acc.config();
    if (!cfg.telegramEnabled || !cfg.telegramClientId || !box.isConnected) { if (box.parentNode) box.parentNode.removeChild(box); return; }
    const btn = document.createElement("button"), msg = document.createElement("div");
    btn.type = "button"; btn.className = "tg-btn"; btn.disabled = true;
    btn.innerHTML = window.Icons.svg("send", 20) + "<span>" + (mode === "link" ? "Привязать Telegram" : "Войти через Telegram") + "</span>";
    msg.className = "status"; msg.setAttribute("role", "alert");
    box.appendChild(btn); box.appendChild(msg);
    let nonce = null;
    const prepare = async () => {
      nonce = null; btn.disabled = true;
      try {
        await loadTelegramLib();
        const r = await acc.telegramNonce();
        if (!box.isConnected) return;
        if (r.ok) { nonce = r.data.nonce; btn.disabled = false; msg.textContent = ""; } else msg.textContent = errText(r);
      } catch (e) { if (box.isConnected) msg.textContent = "Не удалось загрузить Telegram. Проверьте интернет и обновите страницу."; }
    };
    btn.onclick = () => {
      if (!nonce || !(window.Telegram && window.Telegram.Login)) return;
      const used = nonce; nonce = null; btn.disabled = true;
      window.Telegram.Login.auth({ client_id: cfg.telegramClientId, scope: ["profile", "write"], nonce: used, lang: "ru" }, async res => {
        if (!res || res.error || !res.id_token) {
          if (res && res.error && res.error !== "popup_closed") window.FX.toast("Вход через Telegram не удался", "alert");
          prepare(); return;
        }
        const r = await acc.telegramLogin(res.id_token);
        if (!r.ok) { window.FX.toast(errText(r), "alert"); prepare(); return; }
        await acc.refresh();
        if (mode === "link") { window.FX.toast("Telegram привязан", "check"); P.account(FW); return; }
        await afterAuth(FW, r.status === 201 || !!(r.data && r.data.created));
        FW.go(afterAuthHref());
      });
    };
    prepare();
  }

  // Бейджи ролей: администратор, тренер, VIP-клиент (действующий платный тариф); без них — пользователь.
  const TIER_NAME = { premium: "Премиум", personal: "Персональный тренер" };
  P.roleBadges = function (r, esc) {
    const out = [];
    if (r.admin) out.push('<span class="role r-admin">Администратор</span>');
    if (r.trainer) out.push('<span class="role r-trainer">Тренер</span>');
    if (r.tier && r.tier !== "free") out.push('<span class="role r-vip">VIP · ' + esc(TIER_NAME[r.tier] || r.tier) + (r.until ? " до " + esc(new Date(r.until).toLocaleDateString("ru-RU")) : "") + "</span>");
    if (!out.length) out.push('<span class="role">Пользователь</span>');
    return '<div class="roles">' + out.join("") + "</div>";
  };
  const myRoles = u => ({ admin: !!u.isAdmin, trainer: !!u.isTrainer, tier: u.tier, until: u.tierUntil });

  P.accountCard = function (FW) {
    const s = A().state, esc = FW.esc;
    if (s.status === "user") {
      return '<div class="card"><div class="row"><div><b>' + esc(s.user.name) + '</b><div class="muted tiny">Баллы в рейтинге: ' + s.stats.points + ' · серия ' + s.stats.streak + '</div></div><a class="pill" href="#/account">Аккаунт</a></div>' + P.roleBadges(myRoles(s.user), esc) +
        '<div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap"><a class="btn" href="#/rating" data-mod="rating">Рейтинг</a><a class="btn ghost-btn" href="#/body" data-mod="progress">Мои данные</a><a class="btn ghost-btn" href="#/tariffs" data-mod="trainers">Тарифы</a>' + (s.user.isAdmin ? '<a class="btn ghost-btn" href="#/admin">Администратор</a>' : '') + '</div></div>';
    }
    if (s.status === "offline") return '<div class="card"><b>Аккаунт</b><p class="muted">Рейтинг и история веса появятся, когда подключится сервер. Приложение работает и так.</p></div>';
    if (s.status === "anon") return '<div class="card"><b>Рейтинг и мои данные</b><p class="muted">Войди, чтобы соревноваться в рейтинге, вести историю веса и роста и получать бонусы за серию.</p><a class="btn" href="#/account">Войти или зарегистрироваться</a></div>';
    return "";
  };

  P.account = function (FW, tab) {
    const { app, esc } = FW, acc = A(), s = acc.state;
    if (s.status === "unknown") { loading(FW); acc.refresh().then(() => P.account(FW, tab)); return; }
    if (s.status === "offline") { app.innerHTML = "<h1>Аккаунт</h1>" + offlineCard; return; }
    if (s.status === "user") {
      app.innerHTML = `<h1>Аккаунт</h1>
        <div class="card">${P.roleBadges(myRoles(s.user), esc)}<div class="row"><div><b>${esc(s.user.name)}</b><div class="muted">${s.user.email ? esc(s.user.email) : "Вход через Telegram"}${s.user.telegram.linked ? " · Telegram" + (s.user.telegram.username ? " @" + esc(s.user.telegram.username) : " привязан") : ""}</div></div><button class="ghost" id="logout" type="button">Выйти</button></div>
          <label class="chk"><input type="checkbox" id="optin" ${s.user.ratingOptIn ? "checked" : ""}> Участвовать в рейтинге: другие увидят моё имя и баллы (вес и рост не показываются)</label></div>
        ${s.user.telegram.linked ? "" : '<div class="card" id="tgbox"><b>Привязать Telegram</b><p class="muted tiny">Тогда можно входить одной кнопкой и получать сообщения от бота.</p></div>'}
        <div class="stats"><div class="card stat"><div class="big">${s.stats.points}</div><div class="muted">баллов в рейтинге</div></div><div class="card stat"><div class="big">${s.stats.streak}</div><div class="muted">серия</div></div></div>
        <div class="row" style="gap:8px"><a class="btn" href="#/rating" data-mod="rating">Рейтинг</a><a class="btn ghost-btn" href="#/body" data-mod="progress">Мои данные</a></div>
        <p class="muted tiny">ID аккаунта: <code>${esc(s.user.id || "")}</code> (нужен, только чтобы назначить администратора)</p>
        <div class="card"><b>Конфиденциальность</b><p class="muted">Имя и баллы видны в рейтинге, только если ты включил участие. Вес, рост и самочувствие видны только тебе. Удаление аккаунта стирает всё с сервера.</p>
          <button class="ghost" id="delacc" type="button">Удалить аккаунт</button>
          <form id="delform" hidden style="margin-top:12px"><label for="delpw"><b>${s.user.hasPassword ? "Пароль для подтверждения" : "Напиши УДАЛИТЬ для подтверждения"}</b></label>
            <input id="delpw" name="pw" type="${s.user.hasPassword ? "password" : "text"}" autocomplete="${s.user.hasPassword ? "current-password" : "off"}" style="width:100%">
            <div class="status" id="delerr" role="alert"></div><button type="submit" class="wide danger">Удалить аккаунт и все данные</button></form></div>`;
      const tgb = document.getElementById("tgbox");
      if (tgb) mountTelegram(FW, tgb, "link");
      document.getElementById("logout").onclick = async () => { await acc.logout(); FW.go("#/"); P.account(FW); };
      document.getElementById("optin").onchange = async ev => { const r = await acc.setRating(ev.target.checked); if (!r.ok) { ev.target.checked = !ev.target.checked; window.FX.toast(r.error || "Не удалось сохранить", "alert"); } else window.FX.toast(ev.target.checked ? "Вы участвуете в рейтинге" : "Вы скрыты из рейтинга", "check"); };
      // Подтверждение удаления — поле на странице (пароль скрыт точками), а не системное окно с открытым текстом.
      const delform = document.getElementById("delform");
      document.getElementById("delacc").onclick = () => { delform.hidden = false; document.getElementById("delpw").focus(); };
      delform.onsubmit = async ev => {
        ev.preventDefault();
        const noPw = !s.user.hasPassword, pw = document.getElementById("delpw").value, err = document.getElementById("delerr");
        if (!pw || (noPw && pw.trim().toUpperCase() !== "УДАЛИТЬ")) { err.textContent = noPw ? "Напиши слово УДАЛИТЬ" : "Введи пароль"; return; }
        const r = await acc.deleteAccount(noPw ? "" : pw, noPw ? "DELETE" : "");
        if (r.ok) { window.FX.toast("Аккаунт удалён", "trash"); FW.go("#/"); P.account(FW); } else err.textContent = r.error || "Не удалось удалить";
      };
      return;
    }
    const reg = tab === "register";
    app.innerHTML = `<h1>${reg ? "Регистрация" : "Вход"}</h1>
      <div class="card" id="tgbox"><b>Войти через Telegram</b><p class="muted tiny">Без пароля и почты: одна кнопка. Нажимая её, вы соглашаетесь на хранение данных на сервере для истории и рейтинга; в рейтинге только имя и очки, и только если вы включите участие.</p></div>
      <div class="chips"><a class="pill ${reg ? "" : "done"}" href="#/account/login">Вход</a><a class="pill ${reg ? "done" : ""}" href="#/account/register">Регистрация</a></div>
      <form id="acform" class="card" novalidate>
        ${reg ? `<label for="acname"><b>Имя в рейтинге</b></label><input id="acname" name="name" maxlength="30" autocomplete="nickname" value="${esc(FW.state.name === "Гость" ? "" : FW.state.name)}" style="width:100%">` : ""}
        <label for="acemail"><b>Электронная почта</b></label><input id="acemail" name="email" type="email" autocomplete="email" style="width:100%">
        <label for="acpw"><b>Пароль</b></label><input id="acpw" name="password" type="password" autocomplete="${reg ? "new-password" : "current-password"}" minlength="8" style="width:100%">
        ${reg ? `<p class="muted tiny">Минимум 8 символов. Почта пока не подтверждается и нужна только для входа.</p>
          <label class="chk"><input type="checkbox" name="consent"> Согласен(на) на хранение моих данных на сервере для истории и рейтинга. Вес, рост и самочувствие видны только мне; в рейтинге только имя и очки, и только если я включу участие.</label>` : ""}
        <div class="status" id="acerr" role="alert"></div>
        <button class="wide" type="submit">${reg ? "Создать аккаунт" : "Войти"}</button>
      </form>
      <p class="muted tiny">Без входа приложение тоже работает: данные лежат на этом устройстве.</p>`;
    mountTelegram(FW, document.getElementById("tgbox"), "login");
    document.getElementById("acform").onsubmit = async ev => {
      ev.preventDefault();
      const f = ev.target.elements, err = document.getElementById("acerr"), btn = ev.target.querySelector("button[type=submit]");
      err.textContent = "";
      if (reg && !f.consent.checked) { err.textContent = "Нужно согласие на хранение данных."; return; }
      btn.disabled = true;
      const r = reg ? await acc.register(f.email.value, f.password.value, f.name.value) : await acc.login(f.email.value, f.password.value);
      btn.disabled = false;
      if (!r.ok) { err.textContent = r.error === "offline" ? "Сервер недоступен, попробуйте позже." : r.error; return; }
      await afterAuth(FW, reg);
      FW.go(afterAuthHref());
    };
  };

  // ---- рейтинг ----
  let period = "week";
  P.rating = async function (FW, p) {
    const { app, esc } = FW, acc = A(), nav = FW.nav();
    if (["week", "month", "all"].includes(p)) period = p;
    if (acc.state.status === "unknown") { loading(FW); await acc.refresh(); if (FW.stale(nav)) return; }
    const s = acc.state;
    const how = `<div class="card"><b>Как считаются баллы</b><p class="muted">За тренировку 20 баллов (за растяжку 10). <b>Бонус за серию:</b> +5 к каждой тренировке начиная с третьей подряд, +10 начиная с седьмой. Серия не рвётся, если между тренировками не больше одного дня отдыха. Засчитывается одна тренировка в день. Бонусы и рейтинг считаются, когда ты вошёл в аккаунт.</p></div>`;
    if (s.status === "offline") { app.innerHTML = "<h1>Рейтинг</h1>" + offlineCard + how; return; }
    const tabs = [["week", "Неделя"], ["month", "Месяц"], ["all", "Всё время"]].map(([id, l]) => `<a class="pill ${period === id ? "done" : ""}" href="#/rating/${id}">${l}</a>`).join("");
    let head = "";
    if (s.status === "anon") head = ctaCard(FW, "Войди, чтобы попасть в рейтинг и получать бонусы за серию.");
    else if (!s.user.ratingOptIn) head = `<div class="card"><p>Ты пока не участвуешь в рейтинге: другие тебя не видят.</p><button id="joinrate" type="button">Участвовать в рейтинге</button> <span class="muted tiny">Увидят только имя и очки.</span></div>`;
    app.innerHTML = `<h1>Рейтинг</h1>${window.Guide.tip("rating")}${P.ideaChips(["K5"])}<div class="chips">${tabs}</div>${head}<div id="lb"><div class="card"><p class="muted">Загружаю…</p></div></div>${how}`;
    const join = document.getElementById("joinrate");
    if (join) join.onclick = async () => { await acc.setRating(true); P.rating(FW); };
    const asked = period, r = await acc.leaderboard(asked);
    const box = document.getElementById("lb");
    if (!box || FW.stale(nav) || asked !== period) return; // ушли со страницы или выбрали другой период
    if (!r.ok) { box.innerHTML = `<div class="card"><p class="muted">${esc(r.error === "offline" ? "Сервер недоступен" : r.error)}</p></div>`; return; }
    const items = r.data.items;
    box.innerHTML = items.length ? items.map(x => `<div class="lb-row ${x.me ? "me" : ""}"><span class="rk">${rankMark(x.rank)}</span><span class="nm">${esc(x.name)}${x.me ? " (вы)" : ""}</span><span class="pt"><b>${x.points}</b><small>${x.workouts} трен.</small></span></div>`).join("")
      : '<div class="card"><p class="muted">Пока в рейтинге никого нет за этот период. Стань первым: включи участие и отметь тренировку.</p></div>';
  };

  // ---- мои данные: вес и рост ----
  let kind = "weight";
  P.body = async function (FW, k) {
    const { app, esc } = FW, acc = A(), nav = FW.nav();
    if (k === "weight" || k === "height") kind = k;
    if (acc.state.status === "unknown") { loading(FW); await acc.refresh(); if (FW.stale(nav)) return; }
    const s = acc.state;
    if (s.status === "offline") { app.innerHTML = "<h1>Мои данные</h1>" + offlineCard; return; }
    if (s.status === "anon") { app.innerHTML = "<h1>Мои данные</h1>" + ctaCard(FW, "История веса и роста хранится в аккаунте. Войди, чтобы вести её."); return; }
    const unit = kind === "weight" ? "кг" : "см";
    app.innerHTML = `<h1>Мои данные</h1><div class="chips"><a class="pill ${kind === "weight" ? "done" : ""}" href="#/body/weight">Вес</a><a class="pill ${kind === "height" ? "done" : ""}" href="#/body/height">Рост</a></div>
      <div class="card" id="bsum"><p class="muted">Загружаю…</p></div>
      <form id="bform" class="card"><label for="bval"><b>Новый замер, ${unit}</b></label>
        <div class="row" style="gap:8px"><input id="bval" name="value" aria-label="Значение, ${unit}" type="number" inputmode="decimal" step="0.1" min="${kind === "weight" ? 30 : 120}" max="${kind === "weight" ? 300 : 230}" style="flex:1" required>
          <input name="day" type="date" aria-label="Дата замера" value="${FW.today()}" max="${FW.today()}" style="width:160px"></div>
        <div class="status" id="berr" role="alert"></div><button class="wide" type="submit">Сохранить замер</button></form>
      <div id="bhist"></div>
      <p class="muted tiny">Данные видны только вам. Фото замеров появятся позже.</p>`;
    const draw = async () => {
      const asked = kind, r = await acc.measurements(asked);
      const sum = document.getElementById("bsum"), hist = document.getElementById("bhist");
      if (!sum || FW.stale(nav) || asked !== kind) return; // ответ пришёл для другой вкладки (вес/рост) или другой страницы
      if (!r.ok) { sum.innerHTML = `<p class="muted">${esc(r.error === "offline" ? "Сервер недоступен" : r.error)}</p>`; return; }
      const items = r.data.items;
      if (!items.length) { sum.innerHTML = `<p class="muted">Замеров пока нет. Добавь первый ниже.</p>`; hist.innerHTML = ""; return; }
      const first = items[0].value, last = items[items.length - 1].value, d = Math.round((last - first) * 10) / 10;
      sum.innerHTML = `<div class="row"><div><div class="big">${last}</div><div class="muted">${unit} сейчас</div></div><div style="text-align:right"><b>${d > 0 ? "+" : ""}${d} ${unit}</b><div class="muted tiny">с ${esc(items[0].day)}</div></div></div>` + window.Charts.line(items, unit);
      hist.innerHTML = items.slice().reverse().slice(0, 30).map(i => `<div class="card row"><span>${esc(i.day)}</span><span><b>${i.value}</b> ${unit} <button class="ghost" data-del="${i.id}" aria-label="Удалить замер">${window.Icons.svg("x", 16)}</button></span></div>`).join("");
      hist.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => { await acc.deleteMeasurement(b.dataset.del); await acc.refresh(); draw(); });
    };
    document.getElementById("bform").onsubmit = async ev => {
      ev.preventDefault();
      const f = ev.target.elements, err = document.getElementById("berr");
      err.textContent = "";
      const r = await acc.addMeasurement(kind, f.value.value, f.day.value);
      if (!r.ok) { err.textContent = r.error === "offline" ? "Сервер недоступен" : r.error; return; }
      f.value.value = "";
      await acc.refresh();
      window.FX.toast("Замер сохранён", "check");
      draw();
    };
    draw();
  };
})();
