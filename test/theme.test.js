// Читаемость цветов: проверяем по самому style.css, что текст на фоне контрастен (WCAG AA 4,5:1) в светлой и тёмной теме.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs"), path = require("path");
const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

function tokens(block) {
  const out = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6}\b|rgba?\([^)]*\))/g)) out[m[1]] = m[2];
  return out;
}
const lum = hex => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const light = tokens(css.slice(css.indexOf(":root {"), css.indexOf("@media (prefers-color-scheme: dark)")));
const darkAuto = tokens(css.slice(css.indexOf("@media (prefers-color-scheme: dark)"), css.indexOf(':root[data-theme="dark"]')));
const darkForced = tokens(css.slice(css.indexOf(':root[data-theme="dark"]'), css.indexOf("/* ================= База")));

// Пары «текст на фоне», которые встречаются в приложении.
const PAIRS = [
  ["text", "bg"], ["text", "surface"], ["text", "surface-2"], ["muted", "bg"], ["muted", "surface"], ["muted", "surface-2"],
  ["accent-text", "surface"], ["accent-text", "bg"], ["accent-text", "accent-soft"], ["on-accent", "accent"],
  ["ok", "ok-soft"], ["warn", "warn-soft"], ["info", "info-soft"], ["info", "surface"],
];
for (const [name, set] of [["светлая тема", light], ["тёмная (по системе)", darkAuto], ["тёмная (выбрана вручную)", darkForced]]) {
  test("контраст 4,5:1 для основных пар: " + name, () => {
    const merged = name === "светлая тема" ? set : Object.assign({}, light, set);
    for (const [fg, bg] of PAIRS) {
      // полупрозрачные фоны в тёмной теме не проверяются попарно: их цвет зависит от подложки
      if (!/^#/.test(merged[fg] || "") || !/^#/.test(merged[bg] || "")) continue;
      assert.ok(ratio(merged[fg], merged[bg]) >= 4.5, `${fg} ${merged[fg]} на ${bg} ${merged[bg]}: ${ratio(merged[fg], merged[bg]).toFixed(2)}`);
    }
  });
}

test("белый текст на крупных цветных карточках (герой) читается: от 4,5:1", () => {
  for (const c of [light["hero-a"], light["hero-b"], "#3556D6", "#22379B", "#A8650A", "#7A4605", "#08794C", "#07663F"]) {
    assert.ok(ratio("#FFFFFF", c) >= 4.5, c + " " + ratio("#FFFFFF", c).toFixed(2));
  }
});

test("тёмная тема, выбранная вручную, и тёмная по системе задают одинаковые цвета", () => {
  assert.deepEqual(darkAuto, darkForced);
  assert.ok(Object.keys(darkForced).length >= 14);
});

test("в стилях не осталось цветов прежнего оформления (мятный, бирюзовый, фиолетовый)", () => {
  for (const old of ["#3ee0a4", "#22d3ee", "#8b5cf6", "rgba(62,224,164", "rgba(139,92,246"]) assert.equal(css.toLowerCase().includes(old.toLowerCase()), false, old);
});
