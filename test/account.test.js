const test = require("node:test"), assert = require("node:assert/strict");
const Account = require("../account.js");
const Charts = require("../charts.js");

test("профиль из браузера → формат сервера: пустое не отправляется", () => {
  assert.deepEqual(Account.profileFromLocal(null), {});
  const p = Account.profileFromLocal({ goal: "muscle", level: 2, days: 4, minutes: 45, place: "gym", limits: ["knees"], sex: null, age: null, height: 180, weight: null });
  assert.deepEqual(p, { goal: "muscle", level: 2, days: 4, minutes: 45, place: "gym", limits: ["knees"], height: 180 });
});

test("история тренировок: последние 30 дней, по одной в день, без будущего", () => {
  const log = [
    { date: "2026-11-01", p: "start", d: "d1", t: "День 1" }, { date: "2026-11-01", p: "start", d: "d2" },
    { date: "2026-10-20", p: "plan", d: "w1", t: "План" }, { date: "2026-09-01", p: "start", d: "d1" },
    { date: "2026-11-09", p: "start", d: "d1" }, null, { date: 5 },
  ];
  const out = Account.workoutsFromLog(log, "2026-11-05");
  assert.deepEqual(out, [{ day: "2026-11-01", program: "start", dayId: "d1", title: "День 1" }, { day: "2026-10-20", program: "plan", dayId: "w1", title: "План" }]);
});

test("без сервера запросы возвращают «offline», а не падают", async () => {
  global.window = global;
  const saved = global.fetch;
  global.fetch = async () => { throw new Error("нет сети"); };
  assert.equal((await Account.api("GET", "/api/me")).error, "offline");
  global.fetch = async () => ({ ok: false, status: 404, json: async () => { throw new Error("не JSON"); } });
  assert.equal((await Account.api("GET", "/api/me")).error, "offline");
  global.fetch = async (u, init) => ({ ok: true, status: 200, json: async () => ({ seen: init.headers["X-FW"] || null, method: init.method }) });
  assert.equal((await Account.api("POST", "/x", {})).data.seen, "1");
  assert.equal((await Account.api("GET", "/x")).data.seen, null);
  assert.equal((await Account.recordWorkout({})).error, "not-signed-in");
  global.fetch = saved;
});

test("график: пусто → пустая строка; одна точка; несколько точек, подписи и экранирование", () => {
  assert.equal(Charts.line([], "кг"), "");
  const one = Charts.line([{ day: "2026-11-01", value: 80 }], "кг");
  assert.match(one, /<svg/); assert.ok(!one.includes("<polyline"));
  const many = Charts.line([{ day: "2026-10-01", value: 82 }, { day: "2026-10-15", value: 81.2 }, { day: "2026-11-01", value: 80.4 }], "кг");
  assert.match(many, /<polyline/); assert.equal((many.match(/<circle/g) || []).length, 3);
  assert.match(many, /01\.10/); assert.match(many, /01\.11/);
  assert.match(Charts.line([{ day: "2026-10-01", value: 70 }, { day: "2026-10-02", value: 70 }], "<кг>"), /&lt;кг&gt;/);
});
