// Страницы с сервером: аккаунт, рейтинг, «Мои данные» (вес и рост с графиком). Подключается до app.js.
(function () {
  "use strict";
  const P = (window.PAGES = window.PAGES || {});
  const A = () => window.Account;
  const MEDAL = ["🥇", "🥈", "🥉"];

  const loading = FW => { FW.app.innerHTML = '<div class="card"><p class="muted">Загружаю…</p></div>'; };
  const offlineCard = '<div class="card"><b>Сервер данных ещё подключается</b><p class="muted">Приложение работает без входа: данные лежат на этом устройстве. Рейтинг, история веса и переписка с тренером появятся, когда сервер заработает.</p></div>';
  const ctaCard = (FW, text) => '<div class="card"><p>' + FW.esc(text) + '</p><a class="btn" href="#/account">Войти или зарегистрироваться</a></div>';

  // Подготовка нового аккаунта: перенос цели, параметров и недавних тренировок из браузера.
  async function afterAuth(FW) {
    const st = FW.state, acc = A();
    if (st.me) await acc.saveProfile(acc.profileFromLocal(st.me));
    const items = acc.workoutsFromLog(st.log, FW.today());
    let added = 0;
    if (items.length) { const r = await acc.syncWorkouts(items); if (r.ok) added = r.data.added; }
    await acc.refresh();
    if (added) window.FX.toast("Перенесено тренировок: " + added, "☁️");
  }

  P.accountCard = function (FW) {
    const s = A().state, esc = FW.esc;
    if (s.status === "user") {
      return '<div class="card"><div class="row"><div><b>👤 ' + esc(s.user.name) + '</b><div class="muted tiny">Очки в рейтинге: ' + s.stats.points + ' · серия ' + s.stats.streak + '</div></div><a class="pill" href="#/account">Аккаунт</a></div>' +
        '<div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap"><a class="btn" href="#/rating">Рейтинг</a><a class="btn ghost-btn" href="#/body">Мои данные</a><a class="btn ghost-btn" href="#/tariffs">Тарифы</a>' + (s.user.isAdmin ? '<a class="btn ghost-btn" href="#/admin">Администратор</a>' : '') + '</div></div>';
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
        <div class="card"><div class="row"><div><b>${esc(s.user.name)}</b><div class="muted">${esc(s.user.email)}</div></div><button class="ghost" id="logout" type="button">Выйти</button></div>
          <label class="chk"><input type="checkbox" id="optin" ${s.user.ratingOptIn ? "checked" : ""}> Участвовать в рейтинге: другие увидят моё имя и очки (вес и рост не показываются)</label></div>
        <div class="stats"><div class="card stat"><div class="big">${s.stats.points}</div><div class="muted">очков</div></div><div class="card stat"><div class="big">${s.stats.streak}</div><div class="muted">серия</div></div></div>
        <div class="row" style="gap:8px"><a class="btn" href="#/rating">Рейтинг</a><a class="btn ghost-btn" href="#/body">Мои данные</a></div>
        <div class="card"><b>Конфиденциальность</b><p class="muted">Имя и очки видны в рейтинге, только если вы включили участие. Вес, рост и самочувствие видны только вам. Удаление аккаунта стирает всё с сервера.</p>
          <button class="ghost" id="delacc" type="button">Удалить аккаунт</button></div>`;
      document.getElementById("logout").onclick = async () => { await acc.logout(); FW.go("#/"); P.account(FW); };
      document.getElementById("optin").onchange = async ev => { const r = await acc.setRating(ev.target.checked); if (!r.ok) { ev.target.checked = !ev.target.checked; window.FX.toast(r.error || "Не удалось сохранить", "⚠️"); } else window.FX.toast(ev.target.checked ? "Вы участвуете в рейтинге" : "Вы скрыты из рейтинга", "✓"); };
      document.getElementById("delacc").onclick = async () => {
        const pw = window.prompt("Чтобы удалить аккаунт и все данные на сервере, введите пароль");
        if (!pw) return;
        const r = await acc.deleteAccount(pw);
        if (r.ok) { window.FX.toast("Аккаунт удалён", "🗑️"); FW.go("#/"); P.account(FW); } else window.FX.toast(r.error || "Не удалось удалить", "⚠️");
      };
      return;
    }
    const reg = tab === "register";
    app.innerHTML = `<h1>${reg ? "Регистрация" : "Вход"}</h1>
      <div class="chips"><a class="pill ${reg ? "" : "done"}" href="#/account/login">Вход</a><a class="pill ${reg ? "done" : ""}" href="#/account/register">Регистрация</a></div>
      <form id="acform" class="card" novalidate>
        ${reg ? `<label><b>Имя в рейтинге</b></label><input name="name" maxlength="30" autocomplete="nickname" value="${esc(FW.state.name === "Гость" ? "" : FW.state.name)}" style="width:100%">` : ""}
        <label><b>Электронная почта</b></label><input name="email" type="email" autocomplete="email" style="width:100%">
        <label><b>Пароль</b></label><input name="password" type="password" autocomplete="${reg ? "new-password" : "current-password"}" minlength="8" style="width:100%">
        ${reg ? `<p class="muted tiny">Минимум 8 символов. Почта пока не подтверждается и нужна только для входа.</p>
          <label class="chk"><input type="checkbox" name="consent"> Согласен(на) на хранение моих данных на сервере для истории и рейтинга. Вес, рост и самочувствие видны только мне; в рейтинге только имя и очки, и только если я включу участие.</label>` : ""}
        <div class="status" id="acerr" role="alert"></div>
        <button class="wide" type="submit">${reg ? "Создать аккаунт" : "Войти"}</button>
      </form>
      <p class="muted tiny">Без входа приложение тоже работает: данные лежат на этом устройстве.</p>`;
    document.getElementById("acform").onsubmit = async ev => {
      ev.preventDefault();
      const f = ev.target.elements, err = document.getElementById("acerr"), btn = ev.target.querySelector("button[type=submit]");
      err.textContent = "";
      if (reg && !f.consent.checked) { err.textContent = "Нужно согласие на хранение данных."; return; }
      btn.disabled = true;
      const r = reg ? await acc.register(f.email.value, f.password.value, f.name.value) : await acc.login(f.email.value, f.password.value);
      btn.disabled = false;
      if (!r.ok) { err.textContent = r.error === "offline" ? "Сервер недоступен, попробуйте позже." : r.error; return; }
      await afterAuth(FW);
      FW.go("#/rating");
    };
  };

  // ---- рейтинг ----
  let period = "week";
  P.rating = async function (FW, p) {
    const { app, esc } = FW, acc = A();
    if (["week", "month", "all"].includes(p)) period = p;
    if (acc.state.status === "unknown") { loading(FW); await acc.refresh(); }
    const s = acc.state;
    const how = `<div class="card"><b>Как считаются очки</b><p class="muted">За тренировку 20 очков (за растяжку 10). <b>Бонус за серию:</b> +5 с третьей тренировки подряд, +10 с седьмой. Серия не рвётся, если пауза между тренировками не больше двух дней. Засчитывается одна тренировка в день.</p></div>`;
    if (s.status === "offline") { app.innerHTML = "<h1>Рейтинг</h1>" + offlineCard + how; return; }
    const tabs = [["week", "Неделя"], ["month", "Месяц"], ["all", "Всё время"]].map(([id, l]) => `<a class="pill ${period === id ? "done" : ""}" href="#/rating/${id}">${l}</a>`).join("");
    let head = "";
    if (s.status === "anon") head = ctaCard(FW, "Войди, чтобы попасть в рейтинг и получать бонусы за серию.");
    else if (!s.user.ratingOptIn) head = `<div class="card"><p>Вы пока не участвуете в рейтинге: другие вас не видят.</p><button id="joinrate" type="button">Участвовать в рейтинге</button> <span class="muted tiny">Увидят только имя и очки.</span></div>`;
    app.innerHTML = `<h1>Рейтинг</h1>${P.ideaChips(["K5"])}<div class="chips">${tabs}</div>${head}<div id="lb"><div class="card"><p class="muted">Загружаю…</p></div></div>${how}`;
    const join = document.getElementById("joinrate");
    if (join) join.onclick = async () => { await acc.setRating(true); P.rating(FW); };
    const r = await acc.leaderboard(period);
    const box = document.getElementById("lb");
    if (!box) return; // ушли со страницы
    if (!r.ok) { box.innerHTML = `<div class="card"><p class="muted">${esc(r.error === "offline" ? "Сервер недоступен" : r.error)}</p></div>`; return; }
    const items = r.data.items;
    box.innerHTML = items.length ? items.map(x => `<div class="lb-row ${x.me ? "me" : ""}"><span class="rk">${MEDAL[x.rank - 1] || x.rank}</span><span class="nm">${esc(x.name)}${x.me ? " (вы)" : ""}</span><span class="pt"><b>${x.points}</b><small>${x.workouts} трен.</small></span></div>`).join("")
      : '<div class="card"><p class="muted">Пока в рейтинге никого нет за этот период. Станьте первым: включите участие и отметьте тренировку.</p></div>';
  };

  // ---- мои данные: вес и рост ----
  let kind = "weight";
  P.body = async function (FW, k) {
    const { app, esc } = FW, acc = A();
    if (k === "weight" || k === "height") kind = k;
    if (acc.state.status === "unknown") { loading(FW); await acc.refresh(); }
    const s = acc.state;
    if (s.status === "offline") { app.innerHTML = "<h1>Мои данные</h1>" + offlineCard; return; }
    if (s.status === "anon") { app.innerHTML = "<h1>Мои данные</h1>" + ctaCard(FW, "История веса и роста хранится в аккаунте. Войди, чтобы вести её."); return; }
    const unit = kind === "weight" ? "кг" : "см";
    app.innerHTML = `<h1>Мои данные</h1><div class="chips"><a class="pill ${kind === "weight" ? "done" : ""}" href="#/body/weight">Вес</a><a class="pill ${kind === "height" ? "done" : ""}" href="#/body/height">Рост</a></div>
      <div class="card" id="bsum"><p class="muted">Загружаю…</p></div>
      <form id="bform" class="card"><label><b>Новый замер, ${unit}</b></label>
        <div class="row" style="gap:8px"><input name="value" type="number" inputmode="decimal" step="0.1" min="${kind === "weight" ? 30 : 120}" max="${kind === "weight" ? 300 : 230}" style="flex:1" required>
          <input name="day" type="date" value="${FW.today()}" max="${FW.today()}" style="width:160px"></div>
        <div class="status" id="berr" role="alert"></div><button class="wide" type="submit">Сохранить замер</button></form>
      <div id="bhist"></div>
      <p class="muted tiny">Данные видны только вам. Фото замеров появятся позже.</p>`;
    const draw = async () => {
      const r = await acc.measurements(kind);
      const sum = document.getElementById("bsum"), hist = document.getElementById("bhist");
      if (!sum) return;
      if (!r.ok) { sum.innerHTML = `<p class="muted">${esc(r.error === "offline" ? "Сервер недоступен" : r.error)}</p>`; return; }
      const items = r.data.items;
      if (!items.length) { sum.innerHTML = `<p class="muted">Замеров пока нет. Добавь первый ниже.</p>`; hist.innerHTML = ""; return; }
      const first = items[0].value, last = items[items.length - 1].value, d = Math.round((last - first) * 10) / 10;
      sum.innerHTML = `<div class="row"><div><div class="big">${last}</div><div class="muted">${unit} сейчас</div></div><div style="text-align:right"><b>${d > 0 ? "+" : ""}${d} ${unit}</b><div class="muted tiny">с ${esc(items[0].day)}</div></div></div>` + window.Charts.line(items, unit);
      hist.innerHTML = items.slice().reverse().slice(0, 30).map(i => `<div class="card row"><span>${esc(i.day)}</span><span><b>${i.value}</b> ${unit} <button class="ghost" data-del="${i.id}" aria-label="Удалить замер">✕</button></span></div>`).join("");
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
      window.FX.toast("Замер сохранён", "✓");
      draw();
    };
    draw();
  };
})();
