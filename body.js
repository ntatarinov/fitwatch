// Модель тела: схематичный вид спереди и сзади, каждая мышечная зона — кнопка.
// Чистая функция svg(view, selected) возвращает разметку; обработчики вешает страница.
(function (root) {
  "use strict";

  const e = (m, cx, cy, rx, ry) => ({ m, t: "ellipse", a: { cx, cy, rx, ry } });
  const r = (m, x, y, w, h) => ({ m, t: "rect", a: { x, y, width: w, height: h, rx: 8 } });
  const pg = (m, pts) => ({ m, t: "polygon", a: { points: pts } });

  // Основа тела (серый силуэт без выбора) и зоны (выбираются).
  const BASE = [
    { t: "circle", a: { cx: 100, cy: 28, r: 18 } },
    { t: "polygon", a: { points: "64,64 136,64 130,176 122,200 78,200 70,176" } },
    { t: "ellipse", a: { cx: 40, cy: 160, rx: 7, ry: 24 } }, { t: "ellipse", a: { cx: 160, cy: 160, rx: 7, ry: 24 } },
    { t: "ellipse", a: { cx: 86, cy: 238, rx: 19, ry: 52 } }, { t: "ellipse", a: { cx: 114, cy: 238, rx: 19, ry: 52 } },
    { t: "ellipse", a: { cx: 84, cy: 332, rx: 12, ry: 40 } }, { t: "ellipse", a: { cx: 116, cy: 332, rx: 12, ry: 40 } },
  ];
  const VIEWS = {
    front: [
      r("neck", 92, 44, 16, 16), e("shoulders", 60, 76, 13, 12), e("shoulders", 140, 76, 13, 12),
      e("chest", 84, 98, 17, 14), e("chest", 116, 98, 17, 14), e("biceps", 47, 112, 8, 22), e("biceps", 153, 112, 8, 22),
      r("abs", 90, 118, 20, 50), e("obliques", 78, 142, 9, 24), e("obliques", 122, 142, 9, 24),
      e("quads", 86, 238, 17, 48), e("quads", 114, 238, 17, 48), e("calves", 84, 330, 11, 34), e("calves", 116, 330, 11, 34),
    ],
    back: [
      r("neck", 92, 44, 16, 16), pg("traps", "86,60 114,60 134,76 100,98 66,76"),
      e("shoulders", 58, 80, 12, 11), e("shoulders", 142, 80, 12, 11),
      e("lats", 80, 124, 14, 30), e("lats", 120, 124, 14, 30), e("triceps", 47, 112, 8, 22), e("triceps", 153, 112, 8, 22),
      r("lower_back", 88, 152, 24, 36), e("glutes", 86, 210, 17, 16), e("glutes", 114, 210, 17, 16),
      e("hamstrings", 86, 262, 16, 38), e("hamstrings", 114, 262, 16, 38), e("calves", 84, 334, 11, 32), e("calves", 116, 334, 11, 32),
    ],
  };

  const attrs = a => Object.keys(a).map(k => k + '="' + a[k] + '"').join(" ");
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // labels: { muscleId: "название" } для подписей кнопок.
  function svg(view, selected, labels) {
    const zones = VIEWS[view];
    if (!zones) return "";
    const base = BASE.map(s => "<" + s.t + ' class="bs-base" ' + attrs(s.a) + "/>").join("");
    const body = zones.map(z => {
      const on = z.m === selected;
      const name = (labels && labels[z.m]) || z.m;
      return "<" + z.t + ' class="mz' + (on ? " on" : "") + '" data-m="' + z.m + '" role="button" tabindex="0" aria-pressed="' + on +
        '" aria-label="' + esc(name) + '" ' + attrs(z.a) + "><title>" + esc(name) + "</title></" + z.t + ">";
    }).join("");
    return '<svg class="body-svg" viewBox="0 0 200 380" role="group" aria-label="' + (view === "front" ? "Вид спереди" : "Вид сзади") + '">' + base + body + "</svg>";
  }

  const musclesIn = view => Array.from(new Set((VIEWS[view] || []).map(z => z.m)));
  const api = { svg, musclesIn, VIEWS: Object.keys(VIEWS) };
  root.Body = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
