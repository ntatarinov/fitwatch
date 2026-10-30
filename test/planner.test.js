const test = require("node:test"), assert = require("node:assert/strict");
const { Catalog, Planner } = require("./setup");
const E = Catalog.EXERCISES;
const goals = Planner.GOALS.map(g => g.id), places = Planner.PLACES.map(p => p.id);

function check(me, plan) {
  const p = plan.params;
  const allowedEq = Planner.EQUIP_BY_PLACE[p.place];
  plan.days.forEach(d => {
    assert.ok(d.items.length >= 1, "пустой день " + d.id);
    const used = new Set();
    d.items.forEach(i => {
      const e = Catalog.byId(i.ex);
      assert.ok(e, "нет упражнения " + i.ex);
      assert.ok(!used.has(i.ex), "повтор в дне: " + i.ex); used.add(i.ex);
      assert.ok(allowedEq.includes(e.equipment), p.place + ": лишнее оборудование у " + i.ex);
      assert.ok(e.level <= p.level, "слишком сложное: " + i.ex);
      assert.ok(!e.avoid.some(a => p.limits.includes(a)), "нарушено ограничение: " + i.ex);
      if (p.limits.includes("heart")) assert.ok(!e.intense, "интенсивное при сердце: " + i.ex);
      assert.ok(i.sets >= 1 && i.reps && i.rest >= 0);
    });
  });
}

test("подбор соблюдает оборудование, уровень и ограничения при всех сочетаниях", () => {
  let n = 0;
  goals.forEach(goal => places.forEach(place => [1, 2, 3].forEach(level => [2, 3, 4, 5, 6].forEach(days => [15, 30, 60].forEach(minutes =>
    [[], ["knees"], ["back", "shoulders"], ["heart"], ["knees", "back", "shoulders", "wrists", "heart"]].forEach(limits => {
      const me = { goal, place, level, days, minutes, limits };
      const plan = Planner.build(me, E);
      check(me, plan);
      assert.equal(plan.days.length, days, "число дней " + JSON.stringify(me));
      n++;
    }))))));
  assert.ok(n > 2000);
});

test("при сердце и давлении добавляется предупреждение и нет интенсивных упражнений", () => {
  const plan = Planner.build({ goal: "lose", place: "home", level: 3, days: 4, minutes: 45, limits: ["heart"] }, E);
  assert.match(plan.warnings[0], /врач/);
  assert.ok(plan.days.every(d => d.items.every(i => !Catalog.byId(i.ex).intense)));
});

test("гибкость: только растяжка", () => {
  const plan = Planner.build({ goal: "flex", place: "gym", level: 2, days: 3, minutes: 30 }, E);
  assert.ok(plan.days.every(d => d.items.every(i => Catalog.byId(i.ex).kind === "stretch")));
});

test("похудение и выносливость добавляют кардио, масса — нет", () => {
  const has = (goal) => Planner.build({ goal, place: "home", level: 2, days: 3, minutes: 45 }, E).days.some(d => d.items.some(i => Catalog.byId(i.ex).kind === "cardio"));
  assert.ok(has("lose")); assert.ok(has("endurance")); assert.ok(!has("muscle"));
});

test("в зале есть тренажёры, дома без инвентаря их нет", () => {
  const gym = Planner.build({ goal: "muscle", place: "gym", level: 2, days: 5, minutes: 60 }, E);
  const home = Planner.build({ goal: "muscle", place: "home", level: 2, days: 5, minutes: 60 }, E);
  const eq = plan => new Set(plan.days.flatMap(d => d.items.map(i => Catalog.byId(i.ex).equipment)));
  assert.ok([...eq(gym)].some(q => q !== "none"));
  assert.deepEqual([...eq(home)], ["none"]);
});

test("упражнения чередуются между днями одного типа", () => {
  const plan = Planner.build({ goal: "muscle", place: "dumbbells", level: 2, days: 4, minutes: 45 }, E);
  const sig = d => d.items.map(i => i.ex).join();
  assert.notEqual(sig(plan.days[0]), sig(plan.days[2]), "верх A и верх B одинаковые");
});

test("неверная анкета заменяется значениями по умолчанию", () => {
  const n = Planner.normalize({ goal: "xx", level: 9, days: 0, minutes: 7, place: "moon", limits: "x" });
  assert.deepEqual(n, { goal: "health", level: 1, days: 3, minutes: 30, place: "home", limits: [] });
});

test("предупреждения написаны по-русски, без служебных слов", () => {
  const plan = Planner.build({ goal: "lose", place: "home", level: 1, days: 3, minutes: 30, limits: ["knees"] }, E);
  plan.warnings.forEach(w => assert.ok(!/shoulders|quads|glutes|calves|\bchest\b|\bback\b|\bcore\b|\barms\b/.test(w), w));
  assert.ok(plan.warnings.some(w => /Нет подходящих упражнений для:/.test(w)));
});

test("короткая тренировка (15 минут) не содержит 10-минутной растяжки", () => {
  goals.forEach(goal => places.forEach(place => {
    const plan = Planner.build({ goal, place, level: 2, days: 3, minutes: 15 }, E);
    plan.days.forEach(d => d.items.forEach(i => assert.ok(!["morning_stretch", "legs_stretch"].includes(i.ex), goal + "/" + place)));
  }));
});

test("слот руки берёт упражнения для рук, а не жимы", () => {
  const plan = Planner.build({ goal: "muscle", place: "dumbbells", level: 2, days: 4, minutes: 60 }, E);
  const armsEx = plan.days.flatMap(d => d.items.map(i => i.ex)).filter(id => ["biceps_curl", "triceps_ext", "triceps_dips"].includes(id));
  assert.ok(armsEx.length >= 2);
});
