const test = require("node:test"), assert = require("node:assert/strict");
const { Catalog } = require("./setup");
const Body = require("../body.js");

test("каждая мышца каталога есть хотя бы на одном виде тела", () => {
  const all = new Set(Body.VIEWS.flatMap(v => Body.musclesIn(v)));
  Catalog.MUSCLES.forEach(m => assert.ok(all.has(m.id), "нет зоны для " + m.id));
  all.forEach(id => assert.ok(Catalog.MUSCLES.some(m => m.id === id), "лишняя зона " + id));
});

test("разметка: каждая мышца — одна кнопка на обе стороны тела, у неё подпись с линией; выбранная отмечена", () => {
  const labels = Object.fromEntries(Catalog.MUSCLES.map(m => [m.id, m.label]));
  const s = Body.svg("front", "chest", labels);
  assert.match(s, /^<svg /);
  assert.equal((s.match(/class="mz on"/g) || []).length, 1, "грудь — одна кнопка для левой и правой стороны");
  assert.equal((s.match(/class="ml on"/g) || []).length, 1, "подпись выбранной мышцы выделена");
  assert.match(s, /data-m="chest"[^>]*aria-pressed="true"/);
  assert.match(s, /aria-label="Грудь"/);
  for (const v of Body.VIEWS) {
    const html = Body.svg(v, null, labels);
    Body.musclesIn(v).forEach(m => {
      assert.ok(new RegExp('class="mz" data-m="' + m + '"').test(html), v + ": кнопка " + m);
      assert.ok(new RegExp('class="ml" data-m="' + m + '"').test(html), v + ": подпись " + m);
    });
    assert.equal((html.match(/class="mz on"/g) || []).length, 0);
  }
  assert.equal(Body.svg("nope", null, labels), "");
  assert.match(Body.svg("back", "hamstrings", labels), /<tspan[^>]*>Задняя<\/tspan><tspan[^>]*>поверхность<\/tspan><tspan[^>]*>бедра<\/tspan>/, "длинная подпись переносится, не обрезается");
});

test("подписи одной стороны не налезают друг на друга", () => {
  const labels = Object.fromEntries(Catalog.MUSCLES.map(m => [m.id, m.label]));
  for (const v of Body.VIEWS) {
    const html = Body.svg(v, null, labels);
    const ys = { start: [], end: [] };
    for (const m of html.matchAll(/<text x="[\d.]+" y="([\d.]+)" text-anchor="(start|end)"/g)) ys[m[2]].push(Number(m[1]));
    for (const side of ["start", "end"]) { const a = ys[side].sort((p, q) => p - q); for (let i = 1; i < a.length; i++) assert.ok(a[i] - a[i - 1] >= 20, v + " " + side + ": " + a.join(",")); }
  }
});

test("подписи экранируются", () => {
  const s = Body.svg("front", null, { chest: '<b>"x"</b>' });
  assert.ok(!s.includes("<b>"));
});

test("3D-анатомия: модель на месте, в ней все 14 групп мышц, фон и кости, подпись авторов и сжатие", () => {
  const B3 = require("../body3d.js"), fs = require("fs"), path = require("path");
  const ids = Catalog.MUSCLES.map(m => m.id);
  assert.deepEqual([...B3.muscles()].sort(), [...ids].sort(), "в 3D те же 14 мышц, что в каталоге");
  const file = path.join(__dirname, "..", B3.MODEL.replace(/^\//, ""));
  const buf = fs.readFileSync(file);
  assert.equal(buf.toString("ascii", 0, 4), "glTF", "это GLB");
  assert.ok(buf.length < 4 * 1024 * 1024, "модель легче 4 МБ: " + buf.length);
  const jsonLen = buf.readUInt32LE(12), gltf = JSON.parse(buf.toString("utf8", 20, 20 + jsonLen));
  const nodes = gltf.nodes.map(n => n.name);
  ids.forEach(id => assert.ok(nodes.includes("m_" + id), "нет группы m_" + id));
  assert.ok(nodes.includes("base_muscle") && nodes.includes("bone"), "фон из мышц и кости");
  assert.match(gltf.asset.copyright, /BodyParts3D.*Database Center for Life Science.*CC BY 4\.0/, "подпись авторов в самом файле");
  assert.ok((gltf.extensionsUsed || []).includes("EXT_meshopt_compression"), "сжатие meshopt");
  assert.match(B3.CREDIT, /BodyParts3D.*CC BY 4\.0/);
  B3.LIBS.forEach(u => assert.match(u, /^https:\/\/(cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/|cdn\.jsdelivr\.net\/npm\/three@0\.128\.0\/)/, "библиотеки закреплены по версии: " + u));
  assert.equal(B3.hasWebGL(), false, "без браузера WebGL нет — mount честно откажет");
});
