// Уровни, достижения и неделя в точках. Чистая логика: считается из состояния, ничего не хранит.
// Нужна для мотивации: человек видит, сколько до следующего уровня и что открыто.
(function (root) {
  "use strict";

  const LEVELS = [
    { min: 0, title: "Новичок" }, { min: 30, title: "Разогрев" }, { min: 100, title: "В ритме" },
    { min: 250, title: "Сила привычки" }, { min: 500, title: "Спортсмен" }, { min: 900, title: "Мастер" }, { min: 1500, title: "Легенда" },
  ];

  // points — баллы. Возвращает номер уровня (с 1), название, долю прохода внутри уровня (0..100) и сколько баллов до следующего.
  function levelOf(points) {
    const p = Math.max(0, Math.floor(Number(points) || 0));
    let i = 0;
    LEVELS.forEach((l, k) => { if (p >= l.min) i = k; });
    const cur = LEVELS[i], next = LEVELS[i + 1] || null;
    return {
      index: i + 1, title: cur.title, points: p, next: next ? next.title : null,
      toNext: next ? next.min - p : 0, pct: next ? Math.round((p - cur.min) / (next.min - cur.min) * 100) : 100,
    };
  }

  // s: { workouts, streak, points, checkins, foodDays, videos, hasPlan }
  const BADGES = [
    { id: "first", emoji: "🚀", title: "Первый шаг", hint: "Отметь первую тренировку", test: s => s.workouts >= 1 },
    { id: "streak3", emoji: "🔥", title: "Серия 3", hint: "Три тренировки подряд с короткими паузами", test: s => s.streak >= 3 },
    { id: "streak7", emoji: "⚡", title: "Серия 7", hint: "Семь тренировок в серии", test: s => s.streak >= 7 },
    { id: "w10", emoji: "💪", title: "10 тренировок", hint: "Десять тренировок всего", test: s => s.workouts >= 10 },
    { id: "w25", emoji: "🏅", title: "25 тренировок", hint: "Двадцать пять тренировок всего", test: s => s.workouts >= 25 },
    { id: "plan", emoji: "🎯", title: "Есть цель", hint: "Подбери план в анкете", test: s => !!s.hasPlan },
    { id: "checkin5", emoji: "📝", title: "Знаю себя", hint: "Заполни пять отзывов за день", test: s => s.checkins >= 5 },
    { id: "food3", emoji: "🍎", title: "Слежу за питанием", hint: "Записывай еду три разных дня", test: s => s.foodDays >= 3 },
    { id: "videos5", emoji: "🎬", title: "Изучаю технику", hint: "Досмотри пять видео упражнений", test: s => s.videos >= 5 },
    { id: "p100", emoji: "⭐", title: "100 баллов", hint: "Набери 100 баллов", test: s => s.points >= 100 },
  ];

  const evaluate = s => BADGES.map(b => ({ id: b.id, emoji: b.emoji, title: b.title, hint: b.hint, got: !!b.test(s) }));
  const unlockedIds = s => evaluate(s).filter(b => b.got).map(b => b.id);

  // Ближайшее ещё не открытое достижение — подсказка, куда двигаться дальше.
  const nextBadge = s => evaluate(s).find(b => !b.got) || null;

  // Семь последних дней по точкам: { label, done, today }. dates — номера дней тренировок (дни с 1970-01-01), todayNum — сегодня.
  const NAMES = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  function weekDots(dateNums, todayNum) {
    const set = new Set(dateNums);
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const n = todayNum - i;
      out.push({ label: NAMES[(n + 4) % 7], done: set.has(n), today: i === 0 });
    }
    return out;
  }

  const api = { LEVELS, BADGES, levelOf, evaluate, unlockedIds, nextBadge, weekDots };
  root.Achievements = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
