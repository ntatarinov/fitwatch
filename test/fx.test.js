const test = require("node:test"), assert = require("node:assert/strict");
const FX = require("../fx.js");

test("без звука, canvas и документа эффекты не падают", () => {
  assert.equal(FX.play("done"), false);      // нет Web Audio
  assert.equal(FX.play("нет такого"), false);
  assert.equal(FX.confetti(), false);        // нет документа
  assert.doesNotThrow(() => { FX.toast("тест", "🎉"); FX.vibrate([10]); FX.celebrate(); });
});

test("счётчик ставит конечное число, в том числе без анимации", () => {
  const el = { textContent: "" };
  FX.countUp(el, 10, 35, 500, " б.");
  assert.equal(el.textContent, "35 б.");
  FX.countUp(el, 5, 5, 500);
  assert.equal(el.textContent, "5");
});

test("описания звуков корректны: частоты и время положительные", () => {
  Object.keys(FX.SOUNDS).forEach(name => FX.SOUNDS[name].forEach(n => {
    assert.ok(n[0] >= 100 && n[0] <= 3000, name + ": частота");
    assert.ok(n[1] >= 0 && n[2] > 0 && n[2] <= 1, name + ": время");
  }));
  ["tap", "done", "level", "badge"].forEach(n => assert.ok(FX.SOUNDS[n]));
});

test("настройка звука хранится и по умолчанию включена", () => {
  const store = {};
  global.window = global;
  global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
  assert.equal(FX.enabled(), true);
  FX.setEnabled(false);
  assert.equal(FX.enabled(), false);
  assert.equal(FX.play("done"), false);
  FX.setEnabled(true);
  assert.equal(FX.enabled(), true);
  delete global.localStorage;
});
