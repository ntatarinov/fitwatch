const test = require("node:test"), assert = require("node:assert/strict");
const I = require("../ideas.js");

test("в списке 14 идей Сани и 11 идей Айдархана, идентификаторы уникальны", () => {
  assert.equal(I.forWho("sanya").length, 14);
  assert.equal(I.forWho("aidarkhan").length, 11);
  assert.equal(new Set(I.ITEMS.map(i => i.id)).size, I.ITEMS.length);
});

test("итоги совпадают с документом 07: Саня 5/5/4 → 54%, Айдархан 0/3/8 → 14%", () => {
  const s = I.summary(I.forWho("sanya")), a = I.summary(I.forWho("aidarkhan"));
  assert.deepEqual([s.ready, s.partial, s.notDone, s.pct, s.strictPct], [5, 5, 4, 54, 36]);
  assert.deepEqual([a.ready, a.partial, a.notDone, a.pct, a.strictPct], [0, 3, 8, 14, 0]);
  assert.deepEqual(I.summary([]), { total: 0, ready: 0, partial: 0, planned: 0, later: 0, notDone: 0, pct: 0, strictPct: 0 });
});

test("у каждой идеи заполнены название, метка и статус из допустимых", () => {
  I.ITEMS.forEach(i => {
    assert.ok(i.title.length > 4 && i.chip.length > 2, i.id);
    assert.ok(Object.keys(I.STATUS_LABEL).includes(i.status), i.id + ": статус");
    assert.ok(i.missing.length > 5, i.id + ": нет описания «чего не хватает»");
  });
});

test("готовые и частично готовые идеи описывают, что сделано, и ведут на экран приложения", () => {
  I.ITEMS.filter(i => i.status === "ready" || i.status === "partial").forEach(i => {
    assert.ok(i.done.length > 10, i.id + ": что сделано");
    assert.match(i.where, /^#\/(library|me|food|trainer|p\/\w+|d\/\w+\/\w+|x\/\w+)?(\/\w+)?$/, i.id + ": ссылка " + i.where);
  });
  I.ITEMS.filter(i => i.status === "planned" || i.status === "later").forEach(i => assert.ok(i.when.length > 3 || i.done.length > 0, i.id + ": когда"));
});

test("запланированное не выдаётся за сделанное", () => {
  I.ITEMS.filter(i => i.status === "later").forEach(i => assert.ok(!i.where || i.id === "A6", i.id));
  assert.equal(I.byId("A11").done, "");
  assert.equal(I.byId("A99"), null);
});

test("главные просьбы Айдархана (К1–К6): статусы честные, готовое ведёт на экран", () => {
  assert.deepEqual(I.PRIORITIES.map(i => i.id), ["K1", "K2", "K3", "K4", "K5", "K6"]);
  assert.deepEqual(I.PRIORITIES.map(i => i.status), ["partial", "partial", "ready", "planned", "partial", "planned"]);
  I.PRIORITIES.filter(i => i.done).forEach(i => assert.ok(i.where, i.id));
  I.PRIORITIES.filter(i => !i.done).forEach(i => assert.equal(i.where, "", i.id + ": запланированное не должно вести на экран"));
  assert.equal(I.byId("K5").chip, "данные, бонусы, рейтинг");
  assert.equal(I.summary(I.forWho("aidarkhan")).total, 11); // К-пункты не входят в проценты
});
