// Новые материалы: справочник тренажёров, программы «В поездке» и «Йога и растяжка для бегунов».
const test = require("node:test"), assert = require("node:assert/strict");
const { Catalog } = require("./setup");
const M = require("../machines.js");
const { basePoints } = require("../api/_lib/app.js");

test("справочник тренажёров: у каждого назначение, мышцы из каталога, настройка, техника, безопасность и ошибки", () => {
  assert.ok(M.MACHINES.length >= 12);
  assert.equal(new Set(M.MACHINES.map(m => m.id)).size, M.MACHINES.length, "id не повторяются");
  const muscles = Catalog.MUSCLES.map(m => m.id);
  M.MACHINES.forEach(m => {
    assert.match(m.id, /^[a-z_]{2,24}$/, m.id);
    assert.ok(["strength", "cardio"].includes(m.kind), m.id);
    assert.ok(m.purpose.length > 20, m.id + ": назначение");
    assert.ok(m.muscles.length >= 1 && m.muscles.every(x => muscles.includes(x)), m.id + ": мышцы");
    assert.ok(m.setup.length >= 2 && m.steps.length >= 2 && m.safety.length >= 2, m.id + ": настройка, техника, безопасность");
    assert.ok(m.mistakes.length > 10, m.id + ": ошибки");
    if (m.exercise) assert.ok(Catalog.byId(m.exercise), m.id + ": нет упражнения " + m.exercise);
  });
  assert.ok(M.MACHINES.some(m => m.kind === "cardio") && M.GENERAL.length >= 4);
  assert.equal(M.byId("leg_press").title, "Жим ногами");
  assert.equal(M.byId("нет"), null);
});

test("новые программы: упражнения есть в каталоге, «В поездке» без прыжков и без инвентаря, йога — лёгкие дни", () => {
  const P = window.PROGRAMS, travel = P.find(p => p.id === "travel"), yoga = P.find(p => p.id === "runyoga");
  assert.ok(travel && yoga);
  for (const p of [travel, yoga]) {
    assert.ok(p.optional, p.id + ": не предлагается как «следующий день»");
    p.days.forEach(d => d.items.forEach(i => {
      const e = Catalog.byId(i.ex);
      assert.ok(e, p.id + ": нет упражнения " + i.ex);
      assert.ok(p.catalog.includes(i.ex), p.id + ": " + i.ex + " не в списке catalog");
    }));
  }
  travel.days.forEach(d => d.items.forEach(i => {
    const e = Catalog.byId(i.ex);
    assert.equal(e.equipment, "none", i.ex + ": в поездке без инвентаря");
    assert.ok(!e.intense, i.ex + ": без прыжков");
  }));
  yoga.days.forEach(d => assert.equal(d.points, 10, "йога — лёгкий день, 10 баллов"));
  assert.equal(basePoints("runyoga"), 10, "сервер тоже даёт 10");
  assert.equal(basePoints("stretch"), 10);
  assert.equal(basePoints("travel"), 20);
  ["leg_swings", "down_dog", "figure_four", "supine_twist"].forEach(id => {
    const e = Catalog.byId(id);
    assert.ok(e && e.kind === "stretch" && e.steps.length >= 3 && e.dose, id);
  });
});
