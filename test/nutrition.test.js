const test = require("node:test"), assert = require("node:assert/strict");
const { Nutrition: N } = require("./setup");

test("в таблице калории согласуются с БЖУ (допуск 15% или 6 ккал)", () => {
  N.FOODS.forEach(f => {
    const est = 4 * f.p + 9 * f.f + 4 * f.c;
    assert.ok(Math.abs(est - f.kcal) <= Math.max(6, 0.15 * f.kcal), f.id + ": " + f.kcal + " против " + Math.round(est));
    assert.ok(f.portion.g >= 1 && f.portion.label);
  });
  assert.equal(new Set(N.FOODS.map(f => f.id)).size, N.FOODS.length);
});

test("расчёт порции", () => {
  assert.deepEqual(N.calc(N.byId("chicken_breast"), 150), { grams: 150, kcal: 248, p: 46.5, f: 5.4, c: 0 });
  assert.equal(N.calc(N.byId("egg"), 0), null);
  assert.equal(N.calc(N.byId("egg"), 5000), null);
  assert.equal(N.calc(null, 100), null);
});

test("итоги дня считают записи без БЖУ отдельно", () => {
  const t = N.sum([{ kcal: 200, p: 10, f: 5, c: 20 }, { kcal: 100 }, { kcal: 50, p: 1.5, f: 0.5, c: 9 }]);
  assert.deepEqual(t, { kcal: 350, p: 11.5, f: 5.5, c: 29, withoutMacros: 1 });
});

test("ориентир на день", () => {
  const t = N.targets({ sex: "m", age: 30, height: 180, weight: 80, days: 3, goal: "health" });
  assert.deepEqual(t, { kcal: 2450, p: 96, f: 68, c: 363, bmr: 1780 });
  const lose = N.targets({ sex: "f", age: 40, height: 160, weight: 60, days: 2, goal: "lose" });
  assert.ok(lose.kcal >= 1200);
  assert.equal(N.targets({ sex: "m", age: 30 }), null);
  assert.equal(N.targets({ sex: "m", age: 5, height: 180, weight: 80 }), null);
});

test("поиск по названию и соответствие фото-подсказок таблице", () => {
  assert.ok(N.search("плов").some(f => f.id === "plov"));
  assert.ok(N.search("ПЛОВ").length >= 1);
  Object.values(N.PHOTO_MAP).forEach(m => assert.ok(N.byId(m.id), "нет продукта " + m.id));
  const keys = window.PHOTO_FOODS.flatMap(f => f.keys);
  Object.keys(N.PHOTO_MAP).forEach(k => assert.ok(keys.includes(k), "ключ фото-модели не найден: " + k));
});
