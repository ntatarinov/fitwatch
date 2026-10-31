// Страница «Как пользоваться», чек-лист первых шагов, переключатель режима и общие обработчики гайдов. Подключается до app.js.
(function () {
  "use strict";
  const P = (window.PAGES = window.PAGES || {});
  const G = () => window.Guide;

  // ---------- чек-лист «Первые шаги» ----------
  // s — результат Guide.steps(). full: без кнопки «Скрыть» (страница инструкции).
  P.stepsCard = function (s, full) {
    const off = Math.round(264 - 264 * s.pct / 100);
    const items = s.list.map(x => {
      const cur = s.current && s.current.id === x.id;
      return `<li class="${x.done ? "done" : ""} ${cur ? "cur" : ""}"><a href="${x.href}"><span class="st-ic">${x.done ? "✓" : x.emoji}</span>
        <span class="st-tx"><b>${x.title}</b><small>${x.done ? "Готово" : x.hint}</small></span>${cur ? `<span class="st-go">Дальше →</span>` : ""}</a></li>`;
    }).join("");
    if (s.complete) {
      return `<div class="card steps complete" id="stepscard"><div class="steps-win"><span class="em">🎉</span><b>Все первые шаги пройдены</b><p class="muted">Теперь ты знаешь главное. Остальное найдёшь в разделах внизу.</p>${full ? "" : `<button type="button" data-steps-x>Отлично</button>`}</div></div>`;
    }
    return `<div class="card steps" id="stepscard"><div class="row"><div><b>Первые шаги</b><div class="muted tiny">Выполнено ${s.done} из ${s.total}</div></div>
      <div class="mini-ring" role="img" aria-label="Выполнено ${s.done} из ${s.total}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="trk" cx="50" cy="50" r="42" fill="none" stroke-width="11"/><circle class="val" cx="50" cy="50" r="42" fill="none" stroke-width="11" stroke-dasharray="264" style="stroke-dashoffset:${off}"/></svg><b>${s.pct}%</b></div></div>
      <ol class="step-list">${items}</ol>${full ? "" : `<button type="button" class="ghost tiny-btn" data-steps-x>Скрыть</button>`}</div>`;
  };

  // Переключатель режима (две карточки-кнопки).
  P.modeSwitch = function () {
    const m = G().mode();
    const b = (id, em, name, text) => `<button type="button" class="mode-opt ${m === id ? "on" : ""}" data-setmode="${id}" aria-pressed="${m === id}"><span class="em">${em}</span><b>${name}</b><small>${text}</small></button>`;
    return `<div class="mode-switch">${b("simple", "🌱", "Простой", "План, тренировки и питание. Подсказки и первые шаги")}${b("pro", "⚡", "Pro", "Тренеры, тарифы, рейтинг, аналитика, идеи команды")}</div>`;
  };

  // Карточка «нужно больше?» для простого режима.
  P.proTeaser = () => `<div class="card teaser"><b>⚡ Нужно больше?</b><p class="muted">Режим Pro открывает тренеров с чатом, тарифы и программы по подписке, рейтинг, журнал сна и аналитику.</p><button type="button" data-setmode="pro">Включить Pro</button></div>`;

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
    ["🏠", "Главная", "Что делать сегодня, неделя, серия и уровень."],
    ["🏋️", "Тренировки", "Твой план, каталог упражнений с видео и готовые программы."],
    ["🍎", "Питание", "Дневник калорий и БЖУ, подсказка по фото."],
    ["🏆", "Рейтинг", "Соревнование по баллам. Виден в режиме Pro.", true],
    ["👤", "Профиль", "Аккаунт, достижения, вес и рост, настройки и режим."],
  ];

  P.guide = function (FW) {
    const ctx = P.stepsCtx ? P.stepsCtx() : {};
    const s = G().steps(ctx);
    const pro = G().isPro();
    FW.app.innerHTML = `<h1>Как пользоваться</h1>
      <p class="muted">Коротко: выбери цель, тренируйся по плану, отмечай каждую тренировку. Остальное по желанию.</p>
      ${P.stepsCard(s, true)}
      <h2>Режим</h2>${P.modeSwitch()}
      <h2>Что где находится</h2>
      ${MAP.filter(m => !m[3] || pro).map(m => `<div class="card map"><span class="em">${m[0]}</span><div><b>${m[1]}</b><div class="muted">${m[2]}</div></div></div>`).join("")}
      <h2>Частые вопросы</h2>
      ${FAQ.map(q => `<details class="card faq"><summary>${q[0]}</summary><p class="muted">${q[1]}</p></details>`).join("")}
      <h2>Приложение на телефоне</h2>
      ${window.Pwa ? window.Pwa.card() || `<div class="card"><p class="muted">${window.Pwa.status() === "installed" ? "Приложение уже установлено, ты в нём." : "В меню браузера выбери «Установить приложение» или «Добавить на главный экран»."}</p></div>` : ""}
      <div class="card"><b>Гайды</b><div class="row" style="margin-top:10px;flex-wrap:wrap"><button type="button" data-replay>Показать приветствие ещё раз</button><button type="button" class="ghost" data-tips-reset>Вернуть подсказки</button></div></div>`;
  };

  // Общие обработчики: один раз на документ, работают на любой странице. FW даёт route() через смену хэша.
  P.bindGuide = function (hooks) {
    const h = hooks || {};
    document.addEventListener("click", ev => {
      const t = ev.target.closest ? ev.target.closest("button,[data-modebtn]") : null;
      if (!t) return;
      const Gd = G();
      if (t.hasAttribute("data-modebtn")) { Gd.setMode(Gd.isPro() ? "simple" : "pro"); return; }
      if (t.dataset.setmode) { Gd.setMode(t.dataset.setmode); return; }
      if (t.dataset.tipX) {
        Gd.dismissTip(t.dataset.tipX);
        const box = t.closest(".tip");
        if (box) { box.classList.add("out"); setTimeout(() => { if (box.parentNode) box.parentNode.removeChild(box); }, 220); }
        return;
      }
      if (t.hasAttribute("data-steps-x")) { Gd.hideSteps(); const c = document.getElementById("stepscard"); if (c) c.remove(); return; }
      if (t.hasAttribute("data-tips-reset")) { Gd.resetTips(); t.textContent = "Подсказки вернулись ✓"; return; }
      if (t.hasAttribute("data-replay")) { Gd.showOnboarding(document, { onDone: () => { if (h.rerender) h.rerender(); } }); return; }
      if (t.hasAttribute("data-install")) { window.Pwa.install().then(() => { if (h.rerender) h.rerender(); }); return; }
      if (t.hasAttribute("data-install-x")) { Gd.hideInstall(); const c = document.getElementById("installcard"); if (c) c.remove(); }
    });
  };
})();
