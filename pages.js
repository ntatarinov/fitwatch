// Страницы: анкета и цель, мой план, каталог с моделью тела, упражнение каталога, дневник питания с БЖУ.
// Подключается до app.js; app.js передаёт в каждую страницу контекст FW (состояние, сохранение, помощники).
(function () {
  "use strict";
  const P = (window.PAGES = window.PAGES || {});
  const lab = (list, id) => window.Catalog.labelOf(list, id);

  // ---------- анкета ----------
  P.me = function (FW) {
    const { app, esc } = FW, st = FW.state, me = st.me || {};
    const C = window.Catalog, PL = window.Planner;
    const chip = (name, val, label, checked, type) =>
      `<label class="chip"><input type="${type || "radio"}" name="${name}" value="${val}" ${checked ? "checked" : ""}><span>${esc(label)}</span></label>`;
    const nums = (name, list, cur, suffix) => `<div class="chips">${list.map(v => chip(name, v, v + (suffix || ""), Number(cur) === v)).join("")}</div>`;
    app.innerHTML = `<a class="back" href="#/programs">← Тренировки</a><h1>Моя цель</h1>
      <p class="muted">Ответь на несколько вопросов, и я подберу план тренировок. Всё хранится только на этом устройстве. Это общая подборка, а не медицинская или тренерская рекомендация.</p>
      <form id="meform" class="card">
        <label><b>Как тебя зовут?</b></label><input name="name" maxlength="30" value="${esc(st.name === "Гость" ? "" : st.name)}" placeholder="Имя" style="width:100%">
        <label><b>Какая цель?</b></label><div class="chips">${PL.GOALS.map(g => chip("goal", g.id, g.label, (me.goal || "health") === g.id)).join("")}</div>
        <label><b>Какой у тебя уровень?</b></label><div class="chips">${C.LEVELS.map(l => chip("level", l.id, l.label, (me.level || 1) === l.id)).join("")}</div>
        <label><b>Сколько дней в неделю?</b></label>${nums("days", [2, 3, 4, 5, 6], me.days || 3)}
        <label><b>Сколько минут на тренировку?</b></label>${nums("minutes", PL.MINUTES, me.minutes || 30, " мин")}
        <label><b>Где занимаешься?</b></label><div class="chips">${PL.PLACES.map(p => chip("place", p.id, p.label, (me.place || "home") === p.id)).join("")}</div>
        <label><b>Что беспокоит? (необязательно)</b></label>
        <div class="chips">${C.LIMITS.map(l => chip("limits", l.id, l.label, (me.limits || []).includes(l.id), "checkbox")).join("")}</div>
        <p class="muted">Эти упражнения я не буду ставить в план. При заболеваниях, болях и после травм сначала посоветуйся с врачом.</p>
        <label><b>Для расчёта питания (необязательно)</b></label>
        <div class="chips">${chip("sex", "m", "Мужчина", me.sex === "m")}${chip("sex", "f", "Женщина", me.sex === "f")}</div>
        <div class="row" style="gap:8px">
          <input name="age" type="number" min="14" max="90" placeholder="Возраст" value="${me.age || ""}" style="width:33%">
          <input name="height" type="number" min="120" max="230" placeholder="Рост, см" value="${me.height || ""}" style="width:33%">
          <input name="weight" type="number" min="30" max="300" step="0.5" placeholder="Вес, кг" value="${me.weight || ""}" style="width:33%">
        </div>
        <div class="status" id="meerr" role="alert"></div>
        <button class="wide" type="submit">Подобрать план</button>
      </form>`;
    document.getElementById("meform").onsubmit = ev => {
      ev.preventDefault();
      const f = ev.target, v = n => f.elements[n] ? f.elements[n].value : "";
      const body = { sex: v("sex") || null, age: v("age"), height: v("height"), weight: v("weight") };
      const filled = ["age", "height", "weight"].filter(k => body[k] !== "").length;
      const err = document.getElementById("meerr");
      const bad = (k, a, b) => body[k] !== "" && !(Number(body[k]) >= a && Number(body[k]) <= b);
      if (filled && (filled < 3 || !body.sex)) { err.textContent = "Для расчёта питания укажи пол, возраст, рост и вес вместе или оставь поля пустыми."; return; }
      if (bad("age", 14, 90) || bad("height", 120, 230) || bad("weight", 30, 300)) { err.textContent = "Проверь значения: возраст 14–90, рост 120–230 см, вес 30–300 кг."; return; }
      const limits = Array.from(f.querySelectorAll('input[name="limits"]:checked')).map(i => i.value);
      const next = {
        goal: v("goal"), level: Number(v("level")), days: Number(v("days")), minutes: Number(v("minutes")), place: v("place"), limits,
        sex: body.sex, age: body.age === "" ? null : Number(body.age), height: body.height === "" ? null : Number(body.height), weight: body.weight === "" ? null : Number(body.weight),
      };
      const s = FW.state;
      s.name = (v("name") || "").trim() || "Гость";
      s.me = next;
      const built = window.Planner.build(next, window.Catalog.EXERCISES);
      s.plan = { builtAt: FW.today(), params: built.params, days: built.days, warnings: built.warnings };
      FW.save();
      FW.go("#/plan");
    };
  };

  // ---------- мой план ----------
  const doneTimes = (st, day) => st.log.filter(l => l.p === "plan" && l.d === day.id && l.date >= st.plan.builtAt).length;

  P.plan = function (FW) {
    const { app, esc } = FW, st = FW.state;
    if (!st.plan) {
      app.innerHTML = `<a class="back" href="#/programs">← Тренировки</a><h1>Мой план</h1>
        <div class="card"><p>Плана пока нет. Расскажи о цели, уровне и ограничениях, и я подберу тренировки.</p><a class="btn" href="#/me">Подобрать план</a></div>`;
      return;
    }
    const plan = st.plan, p = plan.params, C = window.Catalog, PL = window.Planner;
    const days = plan.days.map(d => {
      const t = doneTimes(st, d);
      return `<a class="card" href="#/pd/${d.id}"><div class="row"><div><b>${esc(d.title)}</b>
        <div class="muted">${d.items.map(i => esc((C.byId(i.ex) || { title: i.ex }).title)).join(" · ")}</div></div>
        <span class="pill ${t ? "done" : ""}">${t ? "✓ ×" + t : "+" + window.DAY_POINTS}</span></div></a>`;
    }).join("");
    app.innerHTML = `<a class="back" href="#/programs">← Тренировки</a><h1>Мой план</h1>
      ${P.ideaChips(["A4", "A7"])}
      <p class="muted">${esc(lab(PL.GOALS, p.goal))} · ${p.days} дн. в неделю по ${p.minutes} мин · ${esc(lab(PL.PLACES, p.place))} · ${esc(lab(C.LEVELS, p.level))}</p>
      ${plan.warnings.length ? `<div class="card warn"><b>Важно</b><ul>${plan.warnings.map(w => `<li>${esc(w)}</li>`).join("")}</ul></div>` : ""}
      ${days}
      <p class="muted">План собран по правилам из твоей анкеты, это общая подборка. Описание техники и нагрузки стоит проверить у тренера.</p>
      <a class="btn ghost-btn" href="#/me">Изменить анкету</a>`;
  };

  P.planDay = function (FW, did, justDone) {
    const { app, esc } = FW, st = FW.state;
    const day = st.plan && st.plan.days.find(x => x.id === did);
    if (!day) return FW.notFound();
    const items = day.items.map((i, n) => {
      const e = window.Catalog.byId(i.ex);
      if (!e) return "";
      return `<div class="card"><div class="row"><div><b>${n + 1}. ${esc(e.title)}</b>
        <div>${i.sets} × ${esc(i.reps)}${i.rest ? " · отдых " + i.rest + " сек" : ""}</div></div>
        <a class="pill" href="#/x/${e.id}">${e.video ? "▶ видео" : "техника"}</a></div></div>`;
    }).join("");
    app.innerHTML = `<a class="back" href="#/plan">← Мой план</a><h1>${esc(day.title)}</h1>
      <p class="muted">Разомнитесь 3–5 минут, затем выполните план. Если не знаете технику, откройте упражнение.</p>${items}<div id="checkin"></div>`;
    FW.renderCheckin({ id: "plan" }, day, justDone, () => P.planDay(FW, did, true));
  };

  // ---------- каталог упражнений и модель тела ----------
  const lib = { q: "", muscle: "", equipment: "", level: 0, kind: "", limits: true };

  P.library = function (FW, preset) {
    const { app, esc } = FW, st = FW.state, C = window.Catalog;
    if (preset && C.MUSCLES.some(m => m.id === preset)) lib.muscle = preset;
    const labels = Object.fromEntries(C.MUSCLES.map(m => [m.id, m.label]));
    const myLimits = (st.me && st.me.limits) || [];
    const sel = (id, list, cur, all) => `<select id="${id}" aria-label="${esc(all)}"><option value="">${esc(all)}</option>${list.map(o => `<option value="${o.id}" ${String(cur) === String(o.id) ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
    app.innerHTML = `<a class="back" href="#/programs">← Тренировки</a><h1>Каталог упражнений</h1>
      ${P.ideaChips(["A1", "A2", "A3"])}
      <p class="muted" id="libcount"></p>
      <div class="card"><b>Выбери мышцу</b><p class="muted">Нажми на мышцу на схеме, и ниже останутся упражнения для неё. Схема упрощённая.</p>
        <div class="body-wrap" id="bodywrap"></div>
        <div class="row" style="margin-top:8px"><span id="musclesel" class="muted"></span><button class="ghost" id="muscleclear" type="button">Сбросить</button></div></div>
      <div class="card"><div class="filters">
        <input id="libq" type="search" placeholder="Поиск по названию" value="${esc(lib.q)}" aria-label="Поиск по названию">
        ${sel("libmuscle", C.MUSCLES, lib.muscle, "Любая мышца")}${sel("libeq", C.EQUIPMENT, lib.equipment, "Любое оборудование")}
        ${sel("liblevel", C.LEVELS, lib.level, "Любой уровень")}${sel("libkind", C.KINDS, lib.kind, "Любой вид")}</div>
        ${myLimits.length ? `<label class="chk"><input type="checkbox" id="libLimits" ${lib.limits ? "checked" : ""}> Не показывать то, что мне не подходит (${esc(myLimits.map(l => lab(C.LIMITS, l)).join(", "))})</label>` : ""}</div>
      <div id="liblist"></div>`;

    const draw = () => {
      const avoid = lib.limits && myLimits.length ? myLimits : null;
      let list = C.filter(C.EXERCISES, { q: lib.q, muscle: lib.muscle, equipment: lib.equipment, kind: lib.kind, level: lib.level || 0, avoid });
      if (avoid && avoid.includes("heart")) list = list.filter(e => !e.intense);
      document.getElementById("bodywrap").innerHTML = ["front", "back"].map(v => `<div class="body-col"><div class="muted body-cap">${v === "front" ? "Спереди" : "Сзади"}</div>${window.Body.svg(v, lib.muscle, labels)}</div>`).join("");
      document.getElementById("musclesel").textContent = lib.muscle ? "Выбрано: " + labels[lib.muscle] : "Мышца не выбрана";
      document.getElementById("libmuscle").value = lib.muscle;
      document.getElementById("libcount").textContent = "Найдено упражнений: " + list.length + " из " + C.EXERCISES.length + ". Видео есть у " + C.EXERCISES.filter(e => e.video).length + ".";
      document.getElementById("liblist").innerHTML = list.length ? list.map(e => `<a class="card" href="#/x/${e.id}"><div class="row"><div><b>${esc(e.title)}</b>
        <div class="muted">${esc(e.muscles.map(m => labels[m]).join(", "))} · ${esc(lab(C.EQUIPMENT, e.equipment))} · ${esc(lab(C.LEVELS, e.level))}</div></div>
        <span class="pill ${e.video ? "done" : ""}">${e.video ? "▶ видео" : "без видео"}</span></div></a>`).join("")
        : "<div class='card'><p class='muted'>Ничего не найдено. Сбросьте фильтры или выберите другую мышцу.</p></div>";
    };
    draw();
    const pick = m => { lib.muscle = lib.muscle === m ? "" : m; draw(); };
    const wrap = document.getElementById("bodywrap");
    wrap.onclick = ev => { const z = ev.target.closest("[data-m]"); if (z) pick(z.dataset.m); };
    wrap.onkeydown = ev => { if ((ev.key === "Enter" || ev.key === " ") && ev.target.dataset && ev.target.dataset.m) { ev.preventDefault(); pick(ev.target.dataset.m); } };
    document.getElementById("muscleclear").onclick = () => { lib.muscle = ""; draw(); };
    document.getElementById("libq").oninput = ev => { lib.q = ev.target.value; draw(); };
    document.getElementById("libmuscle").onchange = ev => { lib.muscle = ev.target.value; draw(); };
    document.getElementById("libeq").onchange = ev => { lib.equipment = ev.target.value; draw(); };
    document.getElementById("liblevel").onchange = ev => { lib.level = Number(ev.target.value) || 0; draw(); };
    document.getElementById("libkind").onchange = ev => { lib.kind = ev.target.value; draw(); };
    const lc = document.getElementById("libLimits");
    if (lc) lc.onchange = ev => { lib.limits = ev.target.checked; draw(); };
  };

  P.exercise = function (FW, id) {
    const { esc } = FW, C = window.Catalog, e = C.byId(id);
    if (!e) return FW.notFound();
    const labels = Object.fromEntries(C.MUSCLES.map(m => [m.id, m.label]));
    const meta = `<div class="tags">${e.muscles.map(m => `<span class="pill">${esc(labels[m])}</span>`).join("")}<span class="pill">${esc(lab(C.EQUIPMENT, e.equipment))}</span><span class="pill">${esc(lab(C.LEVELS, e.level))}</span><span class="pill">${esc(lab(C.KINDS, e.kind))}</span></div>` +
      (e.avoid.length ? `<p class="muted">Осторожно при: ${esc(e.avoid.map(a => lab(C.LIMITS, a)).join(", ").toLowerCase())}. Если появилась боль, остановитесь и посоветуйтесь с врачом.</p>` : "") +
      `<p class="muted tiny">Описание техники даёт общие сведения; его нужно проверить у тренера.</p>`;
    FW.renderExercise({ e, key: e.ref || "lib/" + e.id, backHref: "#/library", backLabel: "← Каталог", points: e.points || 5, meta });
  };

  // ---------- питание: калории и БЖУ ----------
  const fmtM = m => "Б " + m.p + " · Ж " + m.f + " · У " + m.c;
  const QUICK = ["egg", "oatmeal", "buckwheat", "chicken_breast", "cottage5", "banana", "apple", "bread", "kefir", "plov"];
  const PORTIONS = [["0.5", "½ порции"], ["1", "1 порция"], ["1.5", "1½ порции"], ["2", "2 порции"]];

  P.food = function (FW) {
    const { app, esc } = FW, st = FW.state, N = window.Nutrition;
    const items = st.food.map((f, i) => ({ f, i })).filter(x => x.f.date === FW.today());
    const sum = N.sum(items.map(x => x.f)), tg = N.targets(st.me), goal = st.kcalGoal;
    const bar = (v, max) => `<div class="bar" style="margin-top:4px"><i style="width:${max ? Math.min(100, v / max * 100) : 0}%"></i></div>`;
    const macro = (name, v, max) => `<div style="margin-top:8px"><div class="row"><span>${name}</span><span><b>${v}</b>${max ? " из " + max + " г" : " г"}</span></div>${max ? bar(v, max) : ""}</div>`;

    app.innerHTML = `<h1>Питание</h1>${P.ideaChips(["A8", "B4"])}<p class="muted">Значения ориентировочные, из справочных таблиц. Это дневник, а не диета и не медицинская рекомендация.</p>
      <div class="card"><div class="row"><div><div class="big">${sum.kcal}</div><div class="muted">ккал из ${goal}</div></div>
        <div style="text-align:right"><label class="muted">Цель, ккал</label><br><input id="goal" type="number" min="800" max="6000" step="50" value="${goal}" style="width:100px"></div></div>
        ${bar(sum.kcal, goal)}
        <p class="muted">${sum.kcal > goal ? "Больше цели на " + (sum.kcal - goal) + " ккал: один день ничего не решает." : "Осталось " + (goal - sum.kcal) + " ккал."}</p>
        ${macro("Белки", sum.p, tg && tg.p)}${macro("Жиры", sum.f, tg && tg.f)}${macro("Углеводы", sum.c, tg && tg.c)}
        ${sum.withoutMacros ? `<p class="muted tiny">Записей только с калориями (без БЖУ): ${sum.withoutMacros}.</p>` : ""}
        ${tg ? `<p class="muted tiny">Ориентир по твоим параметрам: ${tg.kcal} ккал, Б ${tg.p} · Ж ${tg.f} · У ${tg.c} (формула Миффлина — Сан Жеора, без диеты). <button class="ghost" id="usetg" type="button">Взять как цель</button></p>`
          : `<p class="muted tiny">Чтобы увидеть ориентир по БЖУ, <a href="#/me" style="text-decoration:underline">укажи пол, возраст, рост и вес</a>.</p>`}</div>
      <h2>Добавить продукт</h2>
      <form id="addf" class="card">
        <label><b>Продукт или блюдо</b></label>
        <input id="fsearch" list="foodlist" placeholder="Начни вводить: плов, банан, творог…" autocomplete="off" style="width:100%">
        <datalist id="foodlist">${N.FOODS.map(f => `<option value="${esc(f.name)}"></option>`).join("")}</datalist>
        <div class="row" style="margin-top:8px"><div><label class="muted">Масса, г</label><input id="fgrams" type="number" min="1" max="3000" step="1" style="width:110px"></div><div id="fprev" class="muted" style="text-align:right">Выбери продукт</div></div>
        <div id="fportion" class="chips"></div>
        <button type="submit" id="faddbtn" disabled>Добавить</button> <span class="status" id="ferr" role="alert"></span>
      </form>
      <h2>Быстро добавить</h2>
      <div class="chips">${QUICK.map(id => { const f = N.byId(id); return `<button class="ghost" data-quick="${id}">${esc(f.name)} · ${esc(f.portion.label)}</button>`; }).join("")}</div>
      <h2>По фото <span class="tag">эксперимент</span></h2>
      <div class="card" id="photobox">
        <p class="muted">Сфотографируй блюдо: модель в браузере подскажет, что это. Массу и состав проверяешь ты: фото не определяет ни порцию, ни масло, ни скрытые ингредиенты. Модель знает общие продукты (фрукты, овощи, пиццу, бургер), но не знает плов, бешбармак, баурсаки: для них выбери вручную выше. Фото не отправляется на сервер.</p>
        <input type="file" id="photo" accept="image/*" capture="environment">
        <div id="photoout"></div>
      </div>
      <h2>Своё блюдо</h2>
      <form id="ff" class="card">
        <div class="row" style="gap:8px"><input name="name" placeholder="Что съел" maxlength="60" style="flex:1" required><input name="kcal" type="number" min="1" max="5000" placeholder="ккал" style="width:90px" required></div>
        <p class="muted tiny">Если знаешь БЖУ (на упаковке), впиши все три значения на 100 г порции целиком, иначе оставь пустыми.</p>
        <div class="row" style="gap:8px"><input name="p" type="number" min="0" max="500" step="0.1" placeholder="Белки, г"><input name="f" type="number" min="0" max="500" step="0.1" placeholder="Жиры, г"><input name="c" type="number" min="0" max="800" step="0.1" placeholder="Углев., г"></div>
        <button type="submit">Добавить</button>
      </form>
      <h2>Сегодня</h2>
      ${items.length ? items.map(({ f, i }) => `<div class="card"><div class="row"><div><b>${esc(f.name)}</b>${f.p != null ? `<div class="muted tiny">${fmtM(f)}</div>` : `<div class="muted tiny">только калории</div>`}</div>
        <div style="text-align:right"><b>${f.kcal}</b> ккал <button class="ghost" data-del="${i}" aria-label="Удалить">✕</button></div></div>
        ${f.nid ? `<div class="row" style="margin-top:6px"><label class="muted">Масса, г</label><input type="number" min="1" max="3000" value="${f.grams}" data-gi="${i}" style="width:100px"></div>` : ""}</div>`).join("") : "<p class='muted'>Пока ничего не добавлено.</p>"}`;

    const addEntry = (food, grams) => {
      const c = N.calc(food, grams);
      if (!c) return false;
      st.food.push({ date: FW.today(), name: food.name, kcal: c.kcal, p: c.p, f: c.f, c: c.c, grams: c.grams, nid: food.id });
      FW.save();
      return true;
    };

    // форма с поиском: выбор продукта, масса, живой расчёт
    let cur = null;
    const gr = document.getElementById("fgrams"), prev = document.getElementById("fprev"), btn = document.getElementById("faddbtn"), por = document.getElementById("fportion");
    const refresh = () => {
      const c = cur && N.calc(cur, gr.value);
      prev.textContent = c ? c.kcal + " ккал · " + fmtM(c) : (cur ? "Укажи массу от 1 до 3000 г" : "Выбери продукт");
      btn.disabled = !c;
    };
    document.getElementById("fsearch").oninput = ev => {
      const v = ev.target.value.trim().toLowerCase();
      cur = N.FOODS.find(f => f.name.toLowerCase() === v) || null;
      por.innerHTML = cur ? `<button type="button" class="ghost" id="fpbtn">${esc(cur.portion.label)}</button>` : "";
      if (cur) { gr.value = cur.portion.g; document.getElementById("fpbtn").onclick = () => { gr.value = cur.portion.g; refresh(); }; }
      refresh();
    };
    gr.oninput = refresh;
    document.getElementById("addf").onsubmit = ev => { ev.preventDefault(); if (cur && addEntry(cur, gr.value)) P.food(FW); };

    app.querySelectorAll("[data-quick]").forEach(b => b.onclick = () => { const f = N.byId(b.dataset.quick); if (addEntry(f, f.portion.g)) P.food(FW); });
    app.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { st.food.splice(+b.dataset.del, 1); FW.save(); P.food(FW); });
    app.querySelectorAll("[data-gi]").forEach(inp => inp.onchange = () => {
      const e = st.food[+inp.dataset.gi], f = e && N.byId(e.nid), c = f && N.calc(f, inp.value);
      if (c) { Object.assign(e, { kcal: c.kcal, p: c.p, f: c.f, c: c.c, grams: c.grams }); FW.save(); }
      P.food(FW);
    });
    document.getElementById("ff").onsubmit = ev => {
      ev.preventDefault();
      const f = ev.target.elements, n = f.name.value.trim().slice(0, 60), kcal = Math.round(Number(f.kcal.value));
      const m = ["p", "f", "c"].map(k => f[k].value);
      const some = m.some(v => v !== ""), all = m.every(v => v !== "" && Number(v) >= 0);
      if (!n || !(kcal > 0) || kcal > 5000 || (some && !all)) { window.alert("Проверь: название, калории (1–5000) и БЖУ целиком или совсем без БЖУ."); return; }
      const e = { date: FW.today(), name: n, kcal };
      if (all) Object.assign(e, { p: Number(m[0]), f: Number(m[1]), c: Number(m[2]) });
      st.food.push(e); FW.save(); P.food(FW);
    };
    document.getElementById("goal").onchange = ev => { const v = Math.round(Number(ev.target.value)); if (v >= 800 && v <= 6000) { st.kcalGoal = v; FW.save(); P.food(FW); } };
    const ut = document.getElementById("usetg");
    if (ut) ut.onclick = () => { st.kcalGoal = tg.kcal; FW.save(); P.food(FW); };
    document.getElementById("photo").onchange = ev => photoFlow(FW, ev.target.files && ev.target.files[0]);
  };

  // Фото блюда → подсказка модели → пользователь проверяет продукт и массу → в дневник.
  async function photoFlow(FW, file) {
    const { esc } = FW, st = FW.state, N = window.Nutrition;
    const out = document.getElementById("photoout");
    if (!file) { out.innerHTML = ""; return; }
    if (!/^image\//.test(file.type)) { out.innerHTML = "<p class='status'>Нужен файл-картинка.</p>"; return; }
    const url = URL.createObjectURL(file);
    out.innerHTML = `<img id="pimg" src="${url}" alt="фото блюда" style="width:100%;max-height:260px;object-fit:contain;border-radius:10px;margin-top:10px"><div class="status" id="pstat">Загружаю модель (около 15 МБ, один раз) и распознаю…</div><div id="pres"></div>`;
    const img = document.getElementById("pimg"), stat = document.getElementById("pstat"), res = document.getElementById("pres");
    try {
      if (!img.complete) await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error("не удалось открыть картинку")); });
      const { preds, matches } = await window.Photo.recognize(img);
      if (!document.getElementById("pres")) return;
      if (!matches.length) { stat.textContent = "Не нашёл знакомой еды (модель видит: " + preds.slice(0, 2).map(p => p.className.split(",")[0]).join(", ") + "). Выбери блюдо вручную выше."; return; }
      stat.textContent = "Возможно, это (проверь продукт и массу):";
      res.innerHTML = matches.slice(0, 3).map((m, i) => {
        const map = N.PHOTO_MAP[m.food.keys[0]], f = map && N.byId(map.id);
        const head = `<b>${esc(m.food.name)}</b><div class="muted">уверенность ${Math.round(m.prob * 100)}%</div>`;
        if (!f) return `<div class="card"><div class="row"><div>${head}<div class="muted tiny">${m.food.kcal} ккал за порцию; БЖУ неизвестно, поэтому записываются только калории</div></div>
          <div><select data-por="${i}">${PORTIONS.map(([v, l]) => `<option value="${v}" ${v === "1" ? "selected" : ""}>${l}</option>`).join("")}</select> <button data-addk="${i}">Добавить</button></div></div></div>`;
        return `<div class="card">${head}<div class="row" style="margin-top:6px;gap:8px"><select data-pf="${i}" style="flex:1">${N.FOODS.map(x => `<option value="${x.id}" ${x.id === f.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
          <input type="number" min="1" max="3000" value="${map.g}" data-pg="${i}" style="width:90px" aria-label="Масса, г"></div>
          <div class="row" style="margin-top:6px"><span class="muted" data-pv="${i}"></span><button data-addm="${i}">Добавить</button></div></div>`;
      }).join("");
      const calcOf = i => { const f = N.byId(res.querySelector(`[data-pf="${i}"]`).value); return { f, c: N.calc(f, res.querySelector(`[data-pg="${i}"]`).value) }; };
      const paint = i => { const { c } = calcOf(i); res.querySelector(`[data-pv="${i}"]`).textContent = c ? c.kcal + " ккал · " + fmtM(c) : "Укажи массу 1–3000 г"; };
      res.querySelectorAll("[data-pf]").forEach(s => { const i = s.dataset.pf; paint(i); s.onchange = () => { res.querySelector(`[data-pg="${i}"]`).value = N.byId(s.value).portion.g; paint(i); }; });
      res.querySelectorAll("[data-pg]").forEach(inp => inp.oninput = () => paint(inp.dataset.pg));
      res.querySelectorAll("[data-addm]").forEach(b => b.onclick = () => {
        const { f, c } = calcOf(b.dataset.addm);
        if (c) { st.food.push({ date: FW.today(), name: f.name, kcal: c.kcal, p: c.p, f: c.f, c: c.c, grams: c.grams, nid: f.id }); FW.save(); P.food(FW); }
      });
      res.querySelectorAll("[data-addk]").forEach(b => b.onclick = () => {
        const i = +b.dataset.addk, k2 = Number(res.querySelector(`[data-por="${i}"]`).value);
        st.food.push({ date: FW.today(), name: matches[i].food.name, kcal: Math.round(matches[i].food.kcal * k2) }); FW.save(); P.food(FW);
      });
    } catch (e) {
      stat.textContent = "Не удалось распознать (" + (e && e.message ? e.message : "ошибка") + "). Нужен интернет для загрузки модели. Выбери блюдо вручную выше.";
    }
  }
  // ---------- идеи команды: кто что предложил и что сделано ----------
  const ST_CLASS = { ready: "ready", partial: "partial", planned: "planned", later: "later" };
  const ideasUi = { who: "", status: "" };
  P.ideaChips = function (ids) {
    const I = window.Ideas;
    const chips = ids.map(id => I.byId(id)).filter(Boolean).map(i => `<a class="idea-chip" href="#/ideas/${i.id}">💡 Идея ${i.who === "sanya" ? "Сани" : "Айдархана"}: ${i.chip}</a>`).join("");
    return chips ? `<div class="idea-row">${chips}</div>` : "";
  };
  P.ideasCard = function () {
    const I = window.Ideas, s = I.summary(I.forWho("sanya")), a = I.summary(I.forWho("aidarkhan"));
    return `<a class="card" href="#/ideas"><div class="row"><div><b>💡 Идеи команды</b><div class="muted tiny">Саня: ${s.pct}% · Айдархан: ${a.pct}% реализовано</div></div><span class="pill">Открыть</span></div></a>`;
  };
  P.ideas = function (FW, arg) {
    const I = window.Ideas, esc = FW.esc;
    let focus = null;
    if (arg === "sanya" || arg === "aidarkhan") ideasUi.who = arg;
    else if (arg && I.byId(arg)) { focus = arg; ideasUi.who = ""; ideasUi.status = ""; }
    const card = i => `<div class="card idea st-${ST_CLASS[i.status]} ${focus === i.id ? "hl" : ""}" id="idea-${i.id}">
      <div class="row"><div><span class="who">${esc(I.PEOPLE.find(p => p.id === i.who).name)}</span> <span class="st ${i.status}">${I.STATUS_LABEL[i.status]}</span></div><span class="muted tiny">${i.id}</span></div>
      <b>${esc(i.title)}</b>
      ${i.done ? `<p>✅ Сделано: ${esc(i.done)}</p>` : ""}
      <p class="muted">Чего не хватает: ${esc(i.missing)}${i.when ? " · " + esc(i.when) : ""}</p>
      ${i.where ? `<a class="btn" href="${i.where}">Посмотреть</a>` : ""}</div>`;
    const person = p => { const sm = I.summary(I.forWho(p.id)); return `<div class="card person"><div class="row"><b>${esc(p.name)}</b><span class="pct">${sm.pct}%</span></div>
      <div class="xp" style="margin:8px 0"><i style="width:${sm.pct}%"></i></div><div class="muted tiny">Готово ${sm.ready} · частично ${sm.partial} · в плане и позже ${sm.notDone} из ${sm.total}</div></div>`; };
    FW.app.innerHTML = `<a class="back" href="#/profile">← Профиль</a><h1>Идеи команды</h1>
      <p class="muted">Что предложили Саня и Айдархан и что с этим сделано. Нажми «Посмотреть», чтобы открыть функцию.</p>
      <div class="persons">${I.PEOPLE.map(person).join("")}</div>
      <p class="muted tiny">Считаем так: готово = 1, частично = 0,5. Цифры по коду и тестам; проверка на разных телефонах впереди.</p>
      <h2>Главное по просьбе Айдархана</h2>${I.PRIORITIES.map(card).join("")}
      <h2>Все идеи</h2>
      <div class="chips" id="ideafilters">
        ${[["", "Все"], ["sanya", "Саня"], ["aidarkhan", "Айдархан"]].map(([v, l]) => `<button class="ghost ${ideasUi.who === v ? "on" : ""}" data-who="${v}" type="button">${l}</button>`).join("")}
        ${[["", "Любой статус"], ["ready", "Готово"], ["partial", "Частично"], ["planned", "В плане"], ["later", "Позже"]].map(([v, l]) => `<button class="ghost ${ideasUi.status === v ? "on" : ""}" data-st="${v}" type="button">${l}</button>`).join("")}</div>
      <div id="ideaslist"></div>`;
    const draw = () => {
      const list = I.ITEMS.filter(i => (!ideasUi.who || i.who === ideasUi.who) && (!ideasUi.status || i.status === ideasUi.status));
      document.getElementById("ideaslist").innerHTML = list.length ? list.map(card).join("") : "<div class='card'><p class='muted'>Нет идей с такими условиями.</p></div>";
      FW.app.querySelectorAll("#ideafilters [data-who]").forEach(b => b.classList.toggle("on", b.dataset.who === ideasUi.who));
      FW.app.querySelectorAll("#ideafilters [data-st]").forEach(b => b.classList.toggle("on", b.dataset.st === ideasUi.status));
    };
    draw();
    FW.app.querySelectorAll("#ideafilters [data-who]").forEach(b => b.onclick = () => { ideasUi.who = b.dataset.who; draw(); });
    FW.app.querySelectorAll("#ideafilters [data-st]").forEach(b => b.onclick = () => { ideasUi.status = b.dataset.st; draw(); });
    if (focus) { const el = document.getElementById("idea-" + focus); if (el && el.scrollIntoView) el.scrollIntoView({ block: "center" }); }
  };
})();
