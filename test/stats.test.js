const test = require("node:test"), assert = require("node:assert/strict");
const S = require("../stats.js");

const TODAY = S.dayNum("2026-11-02");
const muscleOf = ex => ({ bench: ["chest", "triceps"], squat: ["quads", "glutes"], row: ["lats", "biceps"] }[ex] || []);
const ses = (date, items, durationSec) => ({ id: date + Math.random(), date, title: "Тест", durationSec: durationSec || 3000, items });
const sets = (...a) => a.map(([reps, kg]) => ({ reps, kg }));

test("тоннаж: вес × повторения, собственный вес даёт 0 кг, пустые и неверные подходы не считаются", () => {
  const v = S.volume(ses("2026-11-01", [
    { ex: "bench", name: "Жим", sets: sets([8, 60], [8, 60], [6, 62.5]) },
    { ex: "pushup", name: "Отжимания", sets: sets([15, 0]) },
    { ex: "x", name: "Мусор", sets: [{ reps: 0, kg: 100 }, { reps: "abc", kg: 5 }, null, { reps: 10, kg: -50 }] },
  ]));
  assert.deepEqual(v, { sets: 5, reps: 8 + 8 + 6 + 15 + 10, tonnage: 8 * 60 + 8 * 60 + 6 * 62.5 });
  assert.deepEqual(S.volume(null), { sets: 0, reps: 0, tonnage: 0 });
  assert.deepEqual(S.volume({ items: "нет" }), { sets: 0, reps: 0, tonnage: 0 });
});

test("уровни мышцы по подходам в неделю: нет, дерево, бронза, серебро, золото", () => {
  assert.deepEqual([0, 0.5, 4.9, 5, 9.9, 10, 14.9, 15, 40].map(S.levelFor), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
  assert.equal(S.LEVELS.map(l => l.label).join(), "Нет нагрузки,Дерево,Бронза,Серебро,Золото");
});

test("сводка за неделю: тренировки, время, подходы, нагрузка по мышцам, окно ровно 7 дней", () => {
  const s = [
    ses("2026-11-02", [{ ex: "bench", name: "Жим", sets: sets([10, 50], [10, 50], [10, 50]) }], 3600),
    ses("2026-10-27", [{ ex: "squat", name: "Присед", sets: sets([5, 100]) }], 1800),          // 6 дней назад: внутри недели
    ses("2026-10-26", [{ ex: "squat", name: "Присед", sets: sets([5, 100]) }], 1800),          // 7 дней назад: уже вне
  ];
  const r = S.summarize(s, [], "week", TODAY, muscleOf);
  assert.deepEqual([r.workouts, r.minutes, r.sets, r.tonnage], [2, 90, 4, 1500 + 500]);
  assert.deepEqual([r.byMuscle.chest.sets, r.byMuscle.chest.level, r.byMuscle.quads.level], [3, 1, 1]);
  assert.equal(r.byMuscle.lats, undefined, "мышц без нагрузки в сводке нет");
});

test("месяц и год делят подходы на число недель периода; «всё время» — от первой тренировки", () => {
  const many = Array.from({ length: 5 }, (_, i) => ses(S.dayStr(TODAY - i * 6), [{ ex: "bench", name: "Жим", sets: sets([10, 40], [10, 40], [10, 40], [10, 40]) }]));
  const m = S.summarize(many, [], "month", TODAY, muscleOf);          // 20 подходов за 30 дней = 4,7 в неделю
  assert.equal(m.byMuscle.chest.sets, 20);
  assert.equal(m.byMuscle.chest.perWeek, 4.7);
  assert.equal(m.byMuscle.chest.level, 1);
  const y = S.summarize(many, [], "year", TODAY, muscleOf);
  assert.equal(y.byMuscle.chest.level, 1);
  const all = S.summarize(many, [], "all", TODAY, muscleOf);          // 25 дней → 3,6 недели → 20/3,57 = 5,6 в неделю
  assert.deepEqual([all.byMuscle.chest.perWeek, all.byMuscle.chest.level], [5.6, 2]);
  const empty = S.summarize([], [], "all", TODAY, muscleOf);
  assert.deepEqual([empty.workouts, empty.tonnage, empty.seconds], [0, 0, 0]);
});

test("отметки готовых программ считаются тренировками без веса и времени; записанные подходы не дублируются", () => {
  const log = [
    { date: "2026-11-01", p: "start", d: "d1" },                    // просто отметка
    { date: "2026-11-02", p: "start", d: "d2", sid: "abc" },        // к ней записана сессия
    { date: "2026-11-02", p: "free", d: "log" },                    // след записи из логгера
  ];
  const s = [ses("2026-11-02", [{ ex: "bench", name: "Жим", sets: sets([8, 60]) }], 2400)];
  const r = S.summarize(s, log, "week", TODAY, muscleOf);
  assert.deepEqual([r.workouts, r.sessions, r.marks, r.tonnage, r.minutes], [2, 1, 1, 480, 40]);
  assert.equal(S.summarize([], log, "week", TODAY, muscleOf).workouts, 1);
});

test("по неделям: восемь столбцов, последний кончается сегодня", () => {
  const s = [ses("2026-11-02", [{ ex: "bench", name: "Жим", sets: sets([10, 100]) }], 3000), ses("2026-10-20", [{ ex: "bench", name: "Жим", sets: sets([10, 50]) }], 1200)];
  const w = S.weekly(s, [{ date: "2026-10-28", p: "start", d: "d1" }], TODAY, 8);
  assert.equal(w.length, 8);
  assert.deepEqual([w[7].workouts, w[7].tonnage, w[7].minutes, w[7].from], [2, 1000, 50, "2026-10-27"]);
  assert.deepEqual([w[6].workouts, w[6].tonnage], [1, 500], "20 октября — на предыдущей неделе (20–26 октября)");
  assert.equal(w[0].workouts, 0);
});

test("формат: килограммы, тонны, время, часы:минуты:секунды", () => {
  const n = " ";
  assert.equal(S.fmtKg(850), "850" + n + "кг");
  assert.equal(S.fmtKg(8998), "9" + n + "т");
  assert.equal(S.fmtKg(12340), "12,3" + n + "т");
  assert.equal(S.fmtKg(62.5), "62,5" + n + "кг");
  assert.equal(S.fmtTime(95 * 60), "95" + n + "мин" === S.fmtTime(95 * 60) ? "95" + n + "мин" : "1" + n + "ч" + n + "35" + n + "мин");
  assert.equal(S.fmtTime(45 * 60), "45" + n + "мин");
  assert.equal(S.fmtTime(3600), "1" + n + "ч");
  assert.equal(S.fmtClock(65), "1:05");
  assert.equal(S.fmtClock(3725), "1:02:05");
  assert.equal(S.fmtKg(-5), "0" + n + "кг");
  assert.equal(S.fmtKg("мусор"), "0" + n + "кг");
});

test("сообщение тренеру: упражнения, подходы и итоги; длинное обрезается, итог остаётся", () => {
  const items = [{ ex: "bench", name: "Жим лёжа", sets: sets([8, 60], [8, 62.5], [5, 0]) }];
  const t = S.summaryText({ title: "Грудь", durationSec: 3300, items }, "12.11");
  assert.match(t, /^Тренировка 12\.11: Грудь\nЖим лёжа: 8×60, 8×62,5, 5 повт\.\nИтого: 3 подходов, 980 кг, 55 мин\.$/);
  const long = Array.from({ length: 60 }, (_, i) => ({ ex: "bench", name: "Упражнение номер " + i, sets: sets(...Array(12).fill([10, 20])) }));
  const lt = S.summaryText({ title: "Много", durationSec: 3600, items: long }, "");
  assert.ok(lt.length <= 2000 && /Итого: 720 подходов/.test(lt) && /…\n/.test(lt), "длина " + lt.length);
});
