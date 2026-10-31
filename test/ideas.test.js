const test = require("node:test"), assert = require("node:assert/strict");
const I = require("../ideas.js");

test("в списке 33 пункта Сани (по его тексту) и 11 идей Айдархана, идентификаторы уникальны", () => {
  assert.equal(I.forWho("sanya").length, 33);
  assert.equal(I.forWho("aidarkhan").length, 11);
  assert.equal(new Set(I.ITEMS.map(i => i.id)).size, I.ITEMS.length);
});

test("итоги совпадают с документом 07: Саня 9/16/8 → 52%, Айдархан 0/4/7 → 18%", () => {
  const s = I.summary(I.forWho("sanya")), a = I.summary(I.forWho("aidarkhan"));
  assert.deepEqual([s.ready, s.partial, s.notDone, s.pct, s.strictPct], [9, 16, 8, 52, 27]);
  assert.deepEqual([a.ready, a.partial, a.notDone, a.pct, a.strictPct], [0, 4, 7, 18, 0]);
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
    assert.match(i.where, /^#\/(library|me|food|trainers?|sleep|tariffs|premium|rating|account|body|checkin|p\/\w+|d\/\w+\/\w+|x\/\w+)?(\/\w+)?$/, i.id + ": ссылка " + i.where);
  });
  I.ITEMS.filter(i => i.status === "planned" || i.status === "later").forEach(i => assert.ok(i.when.length > 3 || i.done.length > 0, i.id + ": когда"));
});

test("запланированное не выдаётся за сделанное", () => {
  I.ITEMS.filter(i => i.status === "later").forEach(i => assert.ok(!i.where, i.id));
  assert.equal(I.byId("A22").done, "");
  assert.equal(I.byId("A99"), null);
});

test("у каждой из 11 идей Айдархана есть его формулировка, статусы и числа сходятся со списком", () => {
  const b = I.forWho("aidarkhan");
  assert.deepEqual(b.map(i => i.id), ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10", "B11"]);
  assert.deepEqual(b.map(i => i.status), ["later", "planned", "later", "partial", "later", "partial", "partial", "planned", "later", "partial", "later"]);
  b.forEach(i => assert.ok(i.ask.length > 40 && /[.)]$/.test(i.ask), i.id + ": формулировка Айдархана"));
  assert.deepEqual(b.map(i => i.chip).slice(0, 3), ["магазин", "справочник тренажёров", "трекер шагов"]);
});

test("основа из переписки: не входит в проценты, а статус совпадает со статусом такой же идеи Сани", () => {
  assert.deepEqual(I.FOUNDATION.map(i => i.id), ["K1", "K2", "K3", "K4", "K5", "K6"]);
  assert.equal(I.summary(I.forWho("aidarkhan")).total, 11, "К-пункты не входят в проценты");
  assert.ok(!I.ITEMS.some(i => i.id[0] === "K"));
  const rank = { later: 0, planned: 1, partial: 2, ready: 3 };
  I.FOUNDATION.filter(f => f.basedOn).forEach(f => {
    const worst = f.basedOn.map(id => I.byId(id).status).reduce((a, c) => (rank[a] <= rank[c] ? a : c));
    assert.equal(f.status, worst, f.id + " расходится с " + f.basedOn.join(","));
  });
  assert.deepEqual(I.FOUNDATION.map(i => i.status), ["ready", "partial", "partial", "partial", "ready", "partial"]);
  I.FOUNDATION.filter(i => i.done).forEach(i => assert.ok(i.where, i.id));
  assert.equal(I.byId("K5").chip, "данные, бонусы, рейтинг");
});

test("в файле ideas.js нет прежнего названия блока и ссылок на него", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "ideas.js"), "utf8");
  assert.ok(!/PRIORITIES/.test(src));
});
