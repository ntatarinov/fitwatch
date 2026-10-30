const test = require("node:test"), assert = require("node:assert/strict");
const A = require("../achievements.js");

test("уровни: границы, прогресс и баллы до следующего", () => {
  assert.deepEqual(A.levelOf(0), { index: 1, title: "Новичок", points: 0, next: "Разогрев", toNext: 30, pct: 0 });
  assert.equal(A.levelOf(29).index, 1);
  assert.equal(A.levelOf(30).title, "Разогрев");
  assert.equal(A.levelOf(65).pct, Math.round((65 - 30) / (100 - 30) * 100));
  const top = A.levelOf(5000);
  assert.deepEqual([top.title, top.next, top.toNext, top.pct], ["Легенда", null, 0, 100]);
  assert.equal(A.levelOf(-5).index, 1);
  assert.equal(A.levelOf("abc").index, 1);
});

test("уровни возрастают, названия и пороги уникальны", () => {
  const mins = A.LEVELS.map(l => l.min);
  assert.deepEqual(mins, mins.slice().sort((a, b) => a - b));
  assert.equal(new Set(mins).size, mins.length);
  assert.equal(new Set(A.LEVELS.map(l => l.title)).size, A.LEVELS.length);
});

const none = { workouts: 0, streak: 0, points: 0, checkins: 0, foodDays: 0, videos: 0, hasPlan: false };

test("достижения: у нового пользователя ничего не открыто", () => {
  assert.deepEqual(A.unlockedIds(none), []);
  assert.equal(A.nextBadge(none).id, "first");
});

test("достижения открываются по условиям", () => {
  assert.deepEqual(A.unlockedIds(Object.assign({}, none, { workouts: 1 })), ["first"]);
  const mid = A.unlockedIds(Object.assign({}, none, { workouts: 10, streak: 7, points: 120, hasPlan: true }));
  ["first", "streak3", "streak7", "w10", "plan", "p100"].forEach(id => assert.ok(mid.includes(id), id));
  assert.ok(!mid.includes("w25"));
  const all = A.unlockedIds({ workouts: 30, streak: 9, points: 500, checkins: 6, foodDays: 4, videos: 6, hasPlan: true });
  assert.equal(all.length, A.BADGES.length);
  assert.equal(A.nextBadge({ workouts: 30, streak: 9, points: 500, checkins: 6, foodDays: 4, videos: 6, hasPlan: true }), null);
});

test("идентификаторы достижений уникальны, у каждого есть подсказка", () => {
  assert.equal(new Set(A.BADGES.map(b => b.id)).size, A.BADGES.length);
  A.BADGES.forEach(b => assert.ok(b.hint.length > 5 && b.title && b.emoji));
});

test("неделя в точках: семь дней, сегодня последний, дни недели верные", () => {
  // 2026-10-30 — пятница; дней с 1970-01-01:
  const today = Math.round(Date.UTC(2026, 9, 30) / 86400000);
  const d = A.weekDots([today, today - 2, today - 10], today);
  assert.equal(d.length, 7);
  assert.equal(d[6].today, true);
  assert.equal(d[6].label, "Пт");
  assert.deepEqual(d.map(x => x.label), ["Сб", "Вс", "Пн", "Вт", "Ср", "Чт", "Пт"]);
  assert.deepEqual(d.map(x => x.done), [false, false, false, false, true, false, true]);
});
