const test = require("node:test"), assert = require("node:assert/strict");
const C = require("../charts.js");

test("столбики: по одному на неделю, подписи и значения, цель — пунктирная линия", () => {
  const svg = C.bars([{ label: "01.11", value: 2 }, { label: "08.11", value: 0 }, { label: "15.11", value: 3 }], { target: 3 });
  assert.equal((svg.match(/<rect/g) || []).length, 3);
  assert.equal((svg.match(/class="bar-rect now"/g) || []).length, 1, "текущая неделя выделена");
  assert.equal((svg.match(/bar-rect zero/g) || []).length, 1, "пустая неделя помечена");
  assert.ok(svg.includes("bar-target"));
  assert.ok(svg.includes('role="img"') && svg.includes("aria-label"));
});

test("столбики: мини-вариант без подписей, пустой список и вредные подписи", () => {
  const mini = C.bars([{ label: "a", value: 1 }, { label: "b", value: 4 }], { small: true });
  assert.ok(mini.includes("mini") && !mini.includes("<text") && !mini.includes("bar-target"));
  assert.equal(C.bars([], {}), "");
  assert.equal(C.bars(null, {}), "");
  const evil = C.bars([{ label: '<img src=x onerror="alert(1)">', value: 1 }], { label: '"><script>' });
  assert.ok(!evil.includes("<img") && !evil.includes("<script"), "подписи не должны попадать в разметку как код");
  const neg = C.bars([{ label: "x", value: -5 }, { label: "y", value: NaN }], {});
  assert.ok(!/NaN|Infinity/.test(neg), "странные числа не ломают график");
});
