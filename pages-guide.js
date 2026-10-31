// Настройки под себя (режим, что важно, тема), чек-лист первых шагов, страница «Как пользоваться». Подключается до app.js.
(function () {
  "use strict";
  const P = (window.PAGES = window.PAGES || {});
  const G = () => window.Guide;
  const ic = (n, s) => (window.Icons ? window.Icons.svg(n, s) : "");

  // ---------- чек-лист «Первые шаги» ----------
  // s — результат Guide.steps(). full: без кнопки «Скрыть» (страница инструкции).
  P.stepsCard = function (s, full) {
    const off = Math.round(264 - 264 * s.pct / 100);
    const items = s.list.map(x => {
      const cur = s.current && s.current.id === x.id;
      return `<li class="${x.done ? "done" : ""} ${cur ? "cur" : ""}"><a href="${x.href}"><span class="st-ic">${x.done ? ic("check", 18) : ic(x.icon, 18)}</span>
        <span class="st-tx"><b>${x.title}</b><small>${x.done ? "Готово" : x.hint}</small></span>${cur ? `<span class="st-go">Дальше</span>` : ""}</a></li>`;
    }).join("");
    if (s.complete) {
      return `<div class="card steps complete" id="stepscard"><div class="steps-win"><span class="em">${ic("trophy", 40)}</span><b>Все первые шаги пройдены</b><p class="muted">Теперь ты знаешь главное. Остальное найдёшь в разделах внизу.</p>${full ? "" : `<button type="button" data-steps-x>Отлично</button>`}</div></div>`;
    }
    return `<div class="card steps" id="stepscard"><div class="row"><div><b>Первые шаги</b><div class="muted tiny">Выполнено ${s.done} из ${s.total}</div></div>
      <div class="mini-ring" role="img" aria-label="Выполнено ${s.done} из ${s.total}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="trk" cx="50" cy="50" r="42" fill="none" stroke-width="11"/><circle class="val" cx="50" cy="50" r="42" fill="none" stroke-width="11" stroke-dasharray="264" style="stroke-dashoffset:${off}"/></svg><b>${s.pct}%</b></div></div>
      <ol class="step-list">${items}</ol>${full ? "" : `<button type="button" class="ghost tiny-btn" data-steps-x>Скрыть</button>`}</div>`;
  };

  // ---------- настройки: режим, что важно, тема ----------
  P.settingsCard = function () {
    const Gd = G(), m = Gd.mode(), th = Gd.theme(), mods = Gd.modules();
    const seg = (attr, cur, list) => `<div class="seg" role="group">${list.map(([v, t, s]) => `<button type="button" class="seg-b ${cur === v ? "on" : ""}" ${attr}="${v}" aria-pressed="${cur === v}"><b>${t}</b>${s ? `<small>${s}</small>` : ""}</button>`).join("")}</div>`;
    const rows = Gd.MODULES.map(x => `<button type="button" class="opt-row ${mods.includes(x.id) ? "on" : ""}" data-mod-toggle="${x.id}" role="switch" aria-checked="${mods.includes(x.id)}">
      <span class="oi">${ic(x.icon, 20)}</span><span class="ot"><b>${x.title}</b><small>${x.hint}</small></span><span class="sw" aria-hidden="true"><i></i></span></button>`).join("");
    return `<div class="card settings" id="settings"><div class="row"><b>Настройки приложения</b><a class="pill" href="#/guide">Как пользоваться</a></div>
      <h3>Режим</h3>${seg("data-setmode", m, [["lite", "Lite", "Только нужное, с подсказками"], ["pro", "Pro", "Больше данных, без подсказок"]])}
      <h3>Что мне важно</h3><p class="muted tiny" style="margin:0 0 8px">Отключённое спрячется из меню и с главной. Включить обратно можно здесь же.</p>
      <div class="opt-row on locked" aria-disabled="true"><span class="oi">${ic("dumbbell", 20)}</span><span class="ot"><b>Тренировки</b><small>Всегда на месте</small></span><span class="sw" aria-hidden="true"><i></i></span></div>${rows}
      <h3>Тема</h3>${seg("data-theme", th, [["auto", "Как в системе"], ["light", "Светлая"], ["dark", "Тёмная"]])}</div>`;
  };

  // Карточка «нужно больше?» для режима Lite.
  P.proTeaser = () => `<div class="card teaser"><b>Нужно больше данных?</b><p class="muted">Режим Pro убирает подсказки и добавляет аналитику, идеи команды и выгрузку отчёта. Нужные разделы включаются в Профиле.</p><button type="button" data-setmode="pro">Включить Pro</button></div>`;

  const FAQ = [
    ["Как считаются баллы?", "За тренировку даётся 20 баллов, за растяжку 10. Ещё бонус за серию: +5 на третий день и +10 на седьмой. За один календарный день засчитывается одна тренировка."],
    ["Что такое серия?", "Это число тренировок подряд. Короткая пауза серию не сжигает: если пропустил день, у тебя есть время вернуться."],
    ["Где хранятся мои данные?", "Прогресс лежит на этом устройстве. Если войти в аккаунт, вес, рост, тренировки и очки сохраняются и на сервере, и их можно открыть с другого телефона."],
    ["Кто видит мой рейтинг?", "Рейтинг показывает только тех, кто сам включил это в Профиле, в разделе «Аккаунт». Выключить можно в любой момент."],
    ["Что видит мой тренер?", "Только то, что ты разрешил в чате: цели и результаты. Доступ отзывается в любой момент."],
    ["Можно ли удалить аккаунт?", "Да: Профиль, «Аккаунт», «Удалить аккаунт». Данные на сервере удаляются полностью."],
    ["Это заменяет врача?", "Нет. Приложение даёт ориентиры, а не лечение. При боли, травмах и болезнях сначала обратись к врачу."],
  ];
  const MAP = [
    ["home", "Главная", "Что делать сегодня, неделя, серия и уровень.", null],
    ["dumbbell", "Тренировки", "Твой план, каталог упражнений с видео и готовые программы.", null],
    ["food", "Питание", "Дневник калорий и БЖУ, подсказка по фото.", "food"],
    ["trophy", "Рейтинг", "Соревнование по баллам с теми, кто согласился.", "rating"],
    ["user", "Профиль", "Аккаунт, достижения, настройки и тема.", null],
  ];

  P.guide = function (FW) {
    const s = G().steps(P.stepsCtx ? P.stepsCtx() : {});
    FW.app.innerHTML = `<h1>Как пользоваться</h1>
      <p class="muted">Коротко: выбери цель, тренируйся по плану, отмечай каждую тренировку. Остальное по желанию.</p>
      ${P.stepsCard(s, true)}
      <h2>Что где находится</h2>
      ${MAP.filter(m => !m[3] || G().show(m[3])).map(m => `<div class="card map"><span class="oi">${ic(m[0], 22)}</span><div><b>${m[1]}</b><div class="muted">${m[2]}</div></div></div>`).join("")}
      <h2>Частые вопросы</h2>
      ${FAQ.map(q => `<details class="card faq"><summary>${q[0]}</summary><p class="muted">${q[1]}</p></details>`).join("")}
      <h2>Приложение на телефоне</h2>
      ${window.Pwa ? window.Pwa.card() || `<div class="card"><p class="muted">${window.Pwa.status() === "installed" ? "Приложение уже установлено, ты в нём." : "В меню браузера выбери «Установить приложение» или «Добавить на главный экран»."}</p></div>` : ""}
      <div class="card"><b>Настроить под себя</b><p class="muted">Режим Lite или Pro, нужные разделы и тема меняются в Профиле.</p><div class="row" style="flex-wrap:wrap;gap:8px"><a class="btn" href="#/profile">Открыть настройки</a><button type="button" class="ghost" data-replay>Показать приветствие ещё раз</button><button type="button" class="ghost" data-tips-reset>Вернуть подсказки</button></div></div>`;
  };

  // Общие обработчики: один раз на документ, работают на любой странице.
  P.bindGuide = function (hooks) {
    const h = hooks || {};
    document.addEventListener("click", ev => {
      const t = ev.target.closest ? ev.target.closest("button,[data-modebtn]") : null;
      if (!t) return;
      const Gd = G();
      if (t.hasAttribute("data-modebtn")) { Gd.setMode(Gd.isPro() ? "lite" : "pro"); return; }
      if (t.dataset.setmode) { Gd.setMode(t.dataset.setmode); return; }
      if (t.dataset.modToggle) { Gd.toggleModule(t.dataset.modToggle); return; }
      if (t.dataset.theme) { Gd.setTheme(t.dataset.theme); return; }
      if (t.dataset.tipX) {
        Gd.dismissTip(t.dataset.tipX);
        const box = t.closest(".tip");
        if (box) { box.classList.add("out"); setTimeout(() => { if (box.parentNode) box.parentNode.removeChild(box); }, 220); }
        return;
      }
      if (t.hasAttribute("data-steps-x")) { Gd.hideSteps(); const c = document.getElementById("stepscard"); if (c) c.remove(); return; }
      if (t.hasAttribute("data-tips-reset")) { Gd.resetTips(); t.textContent = "Подсказки вернулись"; return; }
      if (t.hasAttribute("data-replay")) { Gd.showOnboarding(document, { onDone: () => { if (h.rerender) h.rerender(); } }); return; }
      if (t.hasAttribute("data-install")) { window.Pwa.install().then(() => { if (h.rerender) h.rerender(); }); return; }
      if (t.hasAttribute("data-install-x")) { Gd.hideInstall(); const c = document.getElementById("installcard"); if (c) c.remove(); }
    });
  };
})();
