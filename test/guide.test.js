const test = require("node:test"), assert = require("node:assert/strict");

function fakeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}
function fresh(storage) {
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });
  delete require.cache[require.resolve("../guide.js")];
  return require("../guide.js");
}

test("по умолчанию простой режим, приветствие ещё не показано", () => {
  const G = fresh(fakeStorage());
  assert.equal(G.mode(), "simple");
  assert.equal(G.isPro(), false);
  assert.equal(G.needsOnboarding(), true);
});

test("режим сохраняется, неверное значение не принимается, подписчик вызывается только при смене", () => {
  const s = fakeStorage(), G = fresh(s);
  const seen = [];
  G.onMode(m => seen.push(m));
  assert.equal(G.setMode("pro"), true);
  assert.equal(G.setMode("pro"), true);
  assert.equal(G.setMode("admin"), false);
  assert.equal(G.mode(), "pro");
  assert.deepEqual(seen, ["pro"]);
  assert.equal(JSON.parse(s.getItem("fitwatch.ui")).mode, "pro");
  assert.equal(fresh(s).mode(), "pro", "после перезагрузки режим на месте");
});

test("испорченные настройки не ломают приложение", () => {
  for (const bad of ["{не json", "null", "[]", '{"mode":"hacker","tips":[1,2],"onboarded":"yes"}']) {
    const s = fakeStorage(); s.setItem("fitwatch.ui", bad);
    const G = fresh(s);
    assert.equal(G.mode(), "simple", bad);
    assert.equal(G.needsOnboarding(), true, bad);
    assert.equal(G.tip("me").includes("data-tip=\"me\""), true, bad);
  }
});

test("без хранилища всё работает до закрытия страницы", () => {
  const G = fresh({ getItem() { throw new Error("запрещено"); }, setItem() { throw new Error("запрещено"); } });
  assert.doesNotThrow(() => G.setMode("pro"));
  assert.equal(G.mode(), "pro");
  assert.doesNotThrow(() => G.finishOnboarding("simple"));
});

test("первые шаги: прогресс и текущий шаг считаются из состояния", () => {
  const G = fresh(fakeStorage());
  let s = G.steps({});
  assert.deepEqual([s.done, s.total, s.pct, s.complete, s.current.id], [0, 4, 0, false, "plan"]);
  s = G.steps({ hasPlan: true, workouts: 1, nextHref: "#/pd/w2" });
  assert.deepEqual([s.done, s.pct, s.current.id], [2, 50, "food"]);
  s = G.steps({ hasPlan: true, workouts: 0, nextHref: "#/pd/w1" });
  assert.equal(s.current.id, "workout");
  assert.equal(s.current.href, "#/pd/w1", "шаг «тренировка» ведёт к следующему дню плана");
  s = G.steps({ hasPlan: true, workouts: 3, foodEntries: 2, loggedIn: true });
  assert.deepEqual([s.complete, s.current, s.pct], [true, null, 100]);
  assert.ok(G.steps({}).list.every(x => x.title && x.hint && /^#\//.test(x.href)));
});

test("подсказки: показываются новичку, исчезают после «Понятно», в Pro скрыты, неизвестные пустые", () => {
  const G = fresh(fakeStorage());
  assert.match(G.tip("library"), /data-tip-x="library"/);
  assert.equal(G.tip("нет такой"), "");
  G.dismissTip("library");
  assert.equal(G.tip("library"), "");
  assert.match(G.tip("food"), /class="tip"/);
  G.setMode("pro");
  assert.equal(G.tip("food"), "", "в Pro подсказок нет");
  G.setMode("simple");
  G.resetTips();
  assert.match(G.tip("library"), /class="tip"/, "после сброса подсказки вернулись");
  G.dismissTip("__proto__"); G.dismissTip("constructor"); // чужие ключи в хранилище не попадают
  assert.equal(G.tip("constructor"), "");
  assert.equal(G.tip("toString"), "");
  assert.deepEqual(Object.keys(G.read().tips), []);
});

test("приветствие: один раз; выбор режима записывается", () => {
  const G = fresh(fakeStorage());
  G.finishOnboarding("pro");
  assert.equal(G.needsOnboarding(), false);
  assert.equal(G.mode(), "pro");
  const G2 = fresh(fakeStorage());
  G2.finishOnboarding();
  assert.equal(G2.mode(), "simple");
});

test("слайды приветствия: четыре, последний — выбор режима, у каждого есть заголовок и текст", () => {
  const G = fresh(fakeStorage());
  assert.equal(G.SLIDES.length, 4);
  assert.equal(G.SLIDES[3].id, "mode");
  G.SLIDES.forEach(s => assert.ok(s.title.length > 5 && s.text.length > 20, s.id));
});
