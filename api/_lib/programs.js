// Расширенные программы по подписке. Содержимое хранится только на сервере и отдаётся по правам тарифа.
// Упражнения — идентификаторы из каталога (catalog.js); подходы и повторения заданы по фазам (неделям).
// Это черновики: перед использованием их должен проверить тренер.
const PROGRAMS = [
  {
    id: "mass4", icon: "💪", minTier: "premium", weeks: 8, level: "средний", place: "зал или гантели",
    title: "Масса: верх и низ, 4 дня", description: "Классический сплит на 8 недель с ростом нагрузки. Нужны гантели, лучше зал.",
    phases: [
      { weeks: "1–2", sets: 3, reps: "12", rest: 60, note: "Освоение техники, вес лёгкий" },
      { weeks: "3–5", sets: 4, reps: "10", rest: 75, note: "Добавляем вес" },
      { weeks: "6–7", sets: 4, reps: "8", rest: 90, note: "Тяжёлые подходы" },
      { weeks: "8", sets: 3, reps: "12", rest: 60, note: "Разгрузка" },
    ],
    days: [
      { id: "d1", title: "День 1 — верх A", items: [{ ex: "db_bench" }, { ex: "db_row" }, { ex: "db_press" }, { ex: "biceps_curl" }, { ex: "triceps_ext" }, { ex: "crunch", sets: 3, reps: "15" }] },
      { id: "d2", title: "День 2 — низ A", items: [{ ex: "goblet_squat" }, { ex: "rdl" }, { ex: "lunge" }, { ex: "calf_raise" }, { ex: "leg_raise", sets: 3, reps: "12" }] },
      { id: "d3", title: "День 3 — верх B", items: [{ ex: "db_fly" }, { ex: "lat_pulldown" }, { ex: "lateral_raise" }, { ex: "biceps_curl" }, { ex: "triceps_dips" }, { ex: "bicycle", sets: 3, reps: "20" }] },
      { id: "d4", title: "День 4 — низ B", items: [{ ex: "leg_press" }, { ex: "glute_bridge" }, { ex: "rdl" }, { ex: "calf_raise" }, { ex: "side_plank", sets: 3, reps: "30 сек" }] },
    ],
  },
  {
    id: "strength3", icon: "🏋️", minTier: "premium", weeks: 6, level: "средний", place: "зал",
    title: "Сила: основа, 3 дня", description: "Три тяжёлых дня в неделю на 6 недель: приседания, жимы, тяги. Нужен зал или гантели и турник.",
    phases: [
      { weeks: "1–2", sets: 4, reps: "6", rest: 120, note: "Рабочие веса, без отказа" },
      { weeks: "3–4", sets: 5, reps: "5", rest: 150, note: "Тяжелее" },
      { weeks: "5", sets: 5, reps: "3", rest: 180, note: "Пик" },
      { weeks: "6", sets: 3, reps: "5", rest: 120, note: "Разгрузка" },
    ],
    days: [
      { id: "d1", title: "День 1 — ноги и жим", items: [{ ex: "goblet_squat" }, { ex: "db_bench" }, { ex: "db_row" }, { ex: "plank", sets: 3, reps: "45 сек" }] },
      { id: "d2", title: "День 2 — тяга и плечи", items: [{ ex: "rdl" }, { ex: "db_press" }, { ex: "pullup" }, { ex: "side_plank", sets: 3, reps: "30 сек" }] },
      { id: "d3", title: "День 3 — всё тело", items: [{ ex: "leg_press" }, { ex: "db_bench" }, { ex: "lat_pulldown" }, { ex: "leg_raise", sets: 3, reps: "10" }] },
    ],
  },
  {
    id: "fatburn4", icon: "🔥", minTier: "premium", weeks: 4, level: "новичок и средний", place: "дома, без инвентаря",
    title: "Жиросжигание: интервалы, 4 недели", description: "Короткие интервальные тренировки без инвентаря. Не для тех, кому нельзя нагрузку на сердце и колени.",
    phases: [
      { weeks: "1", sets: 3, reps: "30 сек", rest: 30, note: "Знакомство" },
      { weeks: "2", sets: 3, reps: "40 сек", rest: 30, note: "Больше работы" },
      { weeks: "3", sets: 4, reps: "40 сек", rest: 25, note: "Больше кругов" },
      { weeks: "4", sets: 4, reps: "45 сек", rest: 20, note: "Пик" },
    ],
    days: [
      { id: "d1", title: "День 1 — круг А", items: [{ ex: "jumping_jacks" }, { ex: "squat" }, { ex: "pushup" }, { ex: "high_knees" }, { ex: "plank" }] },
      { id: "d2", title: "День 2 — круг Б", items: [{ ex: "lunge" }, { ex: "incline_pushup" }, { ex: "glute_bridge" }, { ex: "bicycle" }, { ex: "brisk_walk", sets: 1, reps: "20 мин" }] },
      { id: "d3", title: "День 3 — круг В", items: [{ ex: "burpee", reps: "8" }, { ex: "squat" }, { ex: "superman" }, { ex: "jumping_jacks" }, { ex: "side_plank" }] },
      { id: "d4", title: "День 4 — лёгкий", items: [{ ex: "brisk_walk", sets: 1, reps: "30 мин" }, { ex: "cat_cow", sets: 1, reps: "10 циклов" }, { ex: "childs_pose", sets: 1, reps: "2 мин" }] },
    ],
  },
  {
    id: "runner3", icon: "🏃", minTier: "premium", weeks: 4, level: "любой", place: "дома",
    title: "Растяжка и мобильность для бегунов, 3 дня", description: "Комплексы растяжки на каждый день: икры, бёдра, спина. Подходит для восстановления после бега.",
    phases: [
      { weeks: "1–2", sets: 2, reps: "30 сек", rest: 0, note: "Мягко, без боли" },
      { weeks: "3–4", sets: 3, reps: "40 сек", rest: 0, note: "Дольше удержание" },
    ],
    days: [
      { id: "d1", title: "День 1 — ноги", items: [{ ex: "calf_stretch" }, { ex: "hamstring_stretch" }, { ex: "hip_flexor_stretch" }] },
      { id: "d2", title: "День 2 — спина и таз", items: [{ ex: "cat_cow", sets: 1, reps: "10 циклов" }, { ex: "childs_pose", sets: 1, reps: "2 мин" }, { ex: "glute_bridge", sets: 2, reps: "12" }] },
      { id: "d3", title: "День 3 — всё вместе", items: [{ ex: "calf_stretch" }, { ex: "hip_flexor_stretch" }, { ex: "hamstring_stretch" }, { ex: "neck_back", sets: 1, reps: "4 мин" }] },
    ],
  },
];

const RANK = { free: 0, premium: 1, personal: 2 };
const canOpen = (tier, p) => RANK[tier] >= RANK[p.minTier];

// Список для человека с данным тарифом: закрытые программы без дней и упражнений.
function listFor(tier) {
  return PROGRAMS.map(p => {
    const open = canOpen(tier, p);
    const base = { id: p.id, icon: p.icon, title: p.title, description: p.description, weeks: p.weeks, level: p.level, place: p.place, minTier: p.minTier, locked: !open, dayCount: p.days.length };
    return open ? Object.assign(base, { phases: p.phases, days: p.days }) : base;
  });
}

module.exports = { PROGRAMS, listFor, canOpen, RANK };
