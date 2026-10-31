// В интерфейсе вместо эмодзи используются значки из icons.js. Тест не даёт эмодзи вернуться в страницы и сервер.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

test("в страницах, скриптах и сервере нет эмодзи", () => {
  const files = ["index.html"].concat(fs.readdirSync(ROOT).filter(f => f.endsWith(".js")), fs.readdirSync(path.join(ROOT, "api", "_lib")).map(f => "api/_lib/" + f));
  const bad = [];
  files.forEach(f => fs.readFileSync(path.join(ROOT, f), "utf8").split("\n").forEach((l, i) => { if (EMOJI.test(l)) bad.push(f + ":" + (i + 1) + " " + l.trim().slice(0, 60)); }));
  assert.deepEqual(bad, []);
});

test("значки, на которые ссылаются данные (программы, достижения), существуют", () => {
  const Icons = require("../icons.js"), A = require("../achievements.js"), P = require("../api/_lib/programs.js");
  A.BADGES.forEach(b => assert.ok(Icons.names.includes(b.icon), "достижение " + b.id + ": нет значка " + b.icon));
  P.PROGRAMS.forEach(p => assert.ok(Icons.names.includes(p.icon), "программа " + p.id + ": нет значка " + p.icon));
  const data = fs.readFileSync(path.join(ROOT, "data.js"), "utf8");
  (data.match(/icon: "([a-z]+)"/g) || []).forEach(m => assert.ok(Icons.names.includes(m.slice(7, -1)), "data.js: нет значка " + m));
});

test("все значки, названные в подсказках и шагах, существуют", () => {
  const Icons = require("../icons.js"), G = require("../guide.js");
  Object.entries(G.TIPS).forEach(([id, t]) => assert.ok(Icons.names.includes(t[0]), "подсказка " + id));
  G.MODULES.forEach(m => assert.ok(Icons.names.includes(m.icon), "раздел " + m.id));
  G.steps({}).list.forEach(s => assert.ok(Icons.names.includes(s.icon), "шаг " + s.id));
});
