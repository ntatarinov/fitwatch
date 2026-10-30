const test = require("node:test"), assert = require("node:assert/strict");
const { Catalog } = require("./setup");
const Body = require("../body.js");

test("каждая мышца каталога есть хотя бы на одном виде тела", () => {
  const all = new Set(Body.VIEWS.flatMap(v => Body.musclesIn(v)));
  Catalog.MUSCLES.forEach(m => assert.ok(all.has(m.id), "нет зоны для " + m.id));
  all.forEach(id => assert.ok(Catalog.MUSCLES.some(m => m.id === id), "лишняя зона " + id));
});

test("разметка: зоны-кнопки с подписями, выбранная отмечена", () => {
  const labels = Object.fromEntries(Catalog.MUSCLES.map(m => [m.id, m.label]));
  const s = Body.svg("front", "chest", labels);
  assert.match(s, /^<svg /);
  assert.equal((s.match(/class="mz on"/g) || []).length, 2); // левая и правая грудь
  assert.match(s, /data-m="chest"[^>]*aria-pressed="true"/);
  assert.match(s, /aria-label="Грудь"/);
  assert.equal(Body.svg("nope", null, labels), "");
  assert.equal((Body.svg("back", null, labels).match(/class="mz on"/g) || []).length, 0);
});

test("подписи экранируются", () => {
  const s = Body.svg("front", null, { chest: '<b>"x"</b>' });
  assert.ok(!s.includes("<b>"));
});
