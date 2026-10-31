const test = require("node:test"), assert = require("node:assert/strict");
const Engine = require("../engine.js");
const base = { profile: null, today: { energy: 4, mood: 4, barrier: "none" }, daysSinceWorkout: 1, trainedToday: false, maxGap: 2, sleepHours: null };

test("совет дня: недосып (меньше 6 часов) предлагает лёгкий день даже без отзыва", () => {
  assert.equal(Engine.advice(Object.assign({}, base, { sleepHours: 5 })).kind, "light");
  assert.equal(Engine.advice(Object.assign({}, base, { sleepHours: 5.5, today: null })).kind, "light");
  assert.equal(Engine.advice(Object.assign({}, base, { sleepHours: 6 })).kind, "go");
  assert.equal(Engine.advice(Object.assign({}, base, { sleepHours: null })).kind, "go");
});

test("тренировка уже была: сон не отменяет «всё сделано»; без отзыва и без недосыпа просит отзыв", () => {
  assert.equal(Engine.advice(Object.assign({}, base, { sleepHours: 4, trainedToday: true })).kind, "done");
  assert.equal(Engine.advice(Object.assign({}, base, { today: null })).kind, "checkin");
});

test("боль и слабые силы по-прежнему дают лёгкий день", () => {
  assert.equal(Engine.advice(Object.assign({}, base, { today: { energy: 4, mood: 4, barrier: "pain" } })).kind, "light");
  assert.equal(Engine.advice(Object.assign({}, base, { today: { energy: 1, mood: 3, barrier: "none" } })).kind, "light");
});
