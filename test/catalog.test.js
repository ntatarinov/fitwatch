const test = require("node:test"), assert = require("node:assert/strict");
const { Catalog } = require("./setup");
const E = Catalog.EXERCISES;
const ids = list => list.map(x => x.id);

test("у каждого упражнения уникальный id и допустимые поля", () => {
  assert.equal(new Set(ids(E)).size, E.length);
  E.forEach(e => {
    assert.ok(e.title && e.title.length > 2, e.id + ": нет названия");
    assert.ok(ids(Catalog.KINDS).includes(e.kind), e.id + ": вид");
    assert.ok(ids(Catalog.EQUIPMENT).includes(e.equipment), e.id + ": оборудование");
    assert.ok(ids(Catalog.LEVELS).includes(e.level), e.id + ": уровень");
    assert.ok(e.muscles.length >= 1 && e.muscles.every(m => ids(Catalog.MUSCLES).includes(m)), e.id + ": мышцы");
    assert.ok(e.avoid.every(a => ids(Catalog.LIMITS).includes(a)), e.id + ": ограничения");
  });
});

test("у каждого упражнения есть шаги, ошибки и дозировка", () => {
  E.forEach(e => {
    assert.ok(Array.isArray(e.steps) && e.steps.length >= 3, e.id + ": шаги");
    assert.ok(e.mistakes && e.mistakes.length > 10, e.id + ": ошибки");
    assert.ok(e.dose && e.dose.length > 5, e.id + ": дозировка");
  });
});

test("упражнения со ссылкой на программы берут данные оттуда", () => {
  const sq = Catalog.byId("squat");
  assert.equal(sq.video, window.PROGRAMS.find(p => p.id === "start").exercises.find(x => x.id === "squat").video);
});

test("видео: 11 символов, без повторов, у «быстрой ходьбы» видео нет", () => {
  const v = E.filter(e => e.video).map(e => e.video);
  v.forEach(id => assert.match(id, /^[A-Za-z0-9_-]{11}$/));
  assert.equal(new Set(v).size, v.length);
  assert.equal(Catalog.byId("brisk_walk").video, null);
  assert.ok(v.length >= 36, "ожидалось не меньше 36 видео, есть " + v.length);
});

test("каждая мышца в каталоге имеет упражнения", () => {
  Catalog.MUSCLES.forEach(m => assert.ok(Catalog.filter(E, { muscle: m.id }).length >= 1, "нет упражнений для " + m.id));
});

test("фильтры и поиск", () => {
  assert.ok(Catalog.filter(E, { muscle: "chest" }).every(e => e.muscles.includes("chest")));
  assert.ok(Catalog.filter(E, { equipment: "dumbbells" }).every(e => e.equipment === "dumbbells"));
  assert.ok(Catalog.filter(E, { kind: "stretch" }).length >= 6);
  assert.ok(Catalog.filter(E, { avoid: ["knees"] }).every(e => !e.avoid.includes("knees")));
  assert.deepEqual(ids(Catalog.filter(E, { q: "ВЫПАДЫ" })), ["lunge"]);
  assert.deepEqual(ids(Catalog.filter(E, { q: "мёртвый" })), ["dead_bug"]);
  assert.equal(Catalog.filter(E, { q: "нет такого упражнения" }).length, 0);
});
