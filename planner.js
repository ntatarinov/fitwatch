// Подбор программы по анкете: цель, уровень, дни в неделю, время, где занимается, ограничения.
// Чистая логика без страницы: правила, не ИИ. Это общая подборка, а не медицинская или тренерская рекомендация.
(function (root) {
  "use strict";

  const GOALS = [
    { id: "lose", label: "Похудеть" }, { id: "muscle", label: "Набрать мышечную массу" },
    { id: "strength", label: "Стать сильнее" }, { id: "endurance", label: "Развить выносливость" },
    { id: "health", label: "Здоровье и тонус" }, { id: "flex", label: "Гибкость и растяжка" },
  ];
  const PLACES = [
    { id: "home", label: "Дома, без инвентаря" }, { id: "dumbbells", label: "Дома, есть гантели" }, { id: "gym", label: "В зале" },
  ];
  const EQUIP_BY_PLACE = { home: ["none"], dumbbells: ["none", "dumbbells"], gym: ["none", "dumbbells", "bar", "machine"] };
  const MINUTES = [15, 30, 45, 60];
  const SLOTS_BY_MINUTES = { 15: 3, 30: 5, 45: 6, 60: 7 };

  const SLOT_LABEL = { quads: "ног", glutes: "ягодиц", calves: "икр", chest: "груди", back: "спины", shoulders: "плеч", arms: "рук", core: "пресса" };
  const SLOT = {
    quads: ["quads"], glutes: ["glutes", "hamstrings"], calves: ["calves"], chest: ["chest"],
    back: ["lats", "traps", "lower_back"], shoulders: ["shoulders"], arms: ["biceps", "triceps"], core: ["abs", "obliques"],
  };
  const TEMPLATES = {
    full: { title: "всё тело", slots: ["quads", "chest", "back", "glutes", "shoulders", "core", "arms"] },
    upper: { title: "верх тела", slots: ["chest", "back", "shoulders", "arms", "core"] },
    lower: { title: "низ тела", slots: ["quads", "glutes", "calves", "quads", "core"] },
    cardio: { title: "кардио и растяжка", slots: [] },
    stretch: { title: "растяжка", slots: [] },
  };
  const LAYOUT = {
    2: ["full", "full"], 3: ["full", "full", "full"], 4: ["upper", "lower", "upper", "lower"],
    5: ["upper", "lower", "full", "upper", "lower"], 6: ["upper", "lower", "full", "upper", "lower", "cardio"],
  };
  // Подходы и отдых по цели (индекс — уровень 1..3); повторения для силовых упражнений.
  const SCHEME = {
    strength: { sets: [3, 4, 4], reps: "5–8", rest: 120 }, muscle: { sets: [3, 3, 4], reps: "8–12", rest: 75 },
    lose: { sets: [3, 3, 3], reps: "12–15", rest: 45 }, endurance: { sets: [3, 3, 4], reps: "15–20", rest: 30 },
    health: { sets: [2, 3, 3], reps: "10–12", rest: 60 },
  };
  const STRETCH_FIXED = { morning_stretch: "10 мин", legs_stretch: "10 мин", neck_back: "4 мин", cat_cow: "8–10 циклов", childs_pose: "1–2 мин" };

  const clamp = (v, a, b, d) => { const n = Math.round(Number(v)); return n >= a && n <= b ? n : d; };
  const secs = lvl => ["20 сек", "30 сек", "45 сек"][lvl - 1];

  function repsFor(e, scheme, level) {
    if (e.id === "brisk_walk") return { sets: 1, reps: "20 мин", rest: 0 };
    if (e.kind === "stretch") return { sets: STRETCH_FIXED[e.id] ? 1 : 2, reps: STRETCH_FIXED[e.id] || "30 сек", rest: 0 };
    if (e.kind === "cardio") return { sets: 3, reps: e.timed ? ["30 сек", "40 сек", "45 сек"][level - 1] : "6–10", rest: 30 };
    if (e.timed) return { sets: 3, reps: secs(level), rest: 45 };
    if (e.kind === "core") return { sets: 3, reps: "12–15", rest: 45 };
    return { sets: scheme.sets[level - 1], reps: scheme.reps, rest: scheme.rest };
  }

  function normalize(me) {
    me = me || {};
    const goal = GOALS.some(g => g.id === me.goal) ? me.goal : "health";
    return {
      goal, level: clamp(me.level, 1, 3, 1), days: clamp(me.days, 2, 6, 3),
      minutes: MINUTES.includes(Number(me.minutes)) ? Number(me.minutes) : 30,
      place: EQUIP_BY_PLACE[me.place] ? me.place : "home",
      limits: Array.isArray(me.limits) ? me.limits.slice() : [],
    };
  }

  // exercises — список из каталога. Возвращает { days, warnings, excluded, params }.
  function build(meRaw, exercises) {
    const me = normalize(meRaw), warnings = [];
    const heart = me.limits.includes("heart");
    const base = exercises.filter(e => EQUIP_BY_PLACE[me.place].includes(e.equipment) && e.level <= me.level);
    const pool = base.filter(e => !e.avoid.some(a => me.limits.includes(a)) && !(heart && e.intense));
    const excluded = base.length - pool.length;
    const order = e => exercises.indexOf(e);
    const byLevel = (a, b) => b.level - a.level || order(a) - order(b);
    const cands = slot => pool.filter(e => (e.kind === "strength" || e.kind === "core") && SLOT[slot].includes(e.muscles[0])).sort(byLevel);
    const cardio = pool.filter(e => e.kind === "cardio").sort((a, b) => order(a) - order(b));
    const LONG_STRETCH = ["morning_stretch", "legs_stretch"];
    const stretchAll = pool.filter(e => e.kind === "stretch").sort((a, b) => order(a) - order(b));
    const stretch = me.minutes < 30 ? stretchAll.filter(e => !LONG_STRETCH.includes(e.id)) : stretchAll;
    const scheme = SCHEME[me.goal] || SCHEME.health;
    const nSlots = SLOTS_BY_MINUTES[me.minutes];
    const layout = me.goal === "flex" ? Array(me.days).fill("stretch") : LAYOUT[me.days];
    const seen = {}, days = [], missing = new Set();

    const item = e => Object.assign({ ex: e.id }, repsFor(e, scheme, me.level));
    const pickFrom = (list, used, offset) => { const av = list.filter(e => !used.has(e.id)); return av.length ? av[offset % av.length] : null; };

    layout.forEach((tplId, di) => {
      const tpl = TEMPLATES[tplId], occ = seen[tplId] = (seen[tplId] || 0) + 1;
      const used = new Set(), items = [], slotCount = {};
      const add = (e) => { if (e) { used.add(e.id); items.push(item(e)); } return !!e; };
      const take = n => stretchOrCardio => { for (let i = 0; i < n; i++) add(pickFrom(stretchOrCardio, used, occ - 1 + i)); };

      if (tplId === "stretch") {
        for (let i = 0; i < Math.min(nSlots, stretch.length); i++) add(pickFrom(stretch, used, (occ - 1) * 2 + i));
      } else if (tplId === "cardio") {
        take(2)(cardio); take(2)(stretch);
      } else {
        const cardioFinish = me.goal === "lose" || me.goal === "endurance";
        const strengthSlots = tpl.slots.slice(0, Math.max(1, cardioFinish && me.minutes === 15 ? nSlots - 1 : nSlots));
        strengthSlots.forEach(slot => {
          slotCount[slot] = (slotCount[slot] || 0) + 1;
          const e = pickFrom(cands(slot), used, occ - 1 + slotCount[slot] - 1);
          if (!add(e)) missing.add(SLOT_LABEL[slot]);
        });
        if (cardioFinish) take(me.minutes >= 45 ? 2 : 1)(cardio);
        if (me.minutes >= 30 || me.goal === "health") take(1)(stretch);
      }
      days.push({ id: "w" + (di + 1), title: "День " + (di + 1) + " — " + tpl.title, items });
    });

    if (missing.size) warnings.push("Нет подходящих упражнений для: " + [...missing].join(", ") + " (при выбранных месте, уровне и ограничениях).");
    if (heart) warnings.unshift("Вы отметили «Сердце или давление»: интенсивные упражнения исключены. Перед тренировками обязательно проконсультируйтесь с врачом.");
    if (me.limits.length && excluded) warnings.push("Исключено упражнений из-за выбранных ограничений: " + excluded + ". Это общая подборка, не медицинская рекомендация.");
    return { params: me, days: days.filter(d => d.items.length), warnings: Array.from(new Set(warnings)), excluded };
  }

  const api = { GOALS, PLACES, MINUTES, EQUIP_BY_PLACE, normalize, build };
  root.Planner = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
