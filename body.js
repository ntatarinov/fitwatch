// Модель тела: манекен с основными поверхностными мышцами спереди и сзади, рядом подписи с выносными линиями.
// Каждая мышца — кнопка (обе стороны тела вместе); подпись тоже выбирает мышцу. Чистая функция svg() возвращает разметку,
// обработчики вешает страница. Рисуется левая половина фигуры, правая — её зеркало.
(function (root) {
  "use strict";

  // Фигура в своих координатах: ширина 200 (середина x = 100), высота 440. На холсте её сдвигает FX/FY.
  const W = 360, H = 452, FX = 80, FY = 6;

  // Основа (не выбирается): голова, шея, корпус, предплечья, кисти, ноги, стопы — серый силуэт под мышцами.
  const SILHOUETTE = [
    "M100 9 C113 9 121 20 121 34 C121 49 112 60 100 60 C88 60 79 49 79 34 C79 20 87 9 100 9 Z",
    "M89 56 L87 76 L100 80 L100 56 Z",
    "M100 76 L84 78 Q62 82 52 94 Q44 106 46 124 L52 148 Q58 176 62 206 Q60 228 56 250 L100 256 Z",
    "M45 186 Q37 212 39 238 L51 241 Q58 214 57 188 Z",
    "M38 238 Q34 252 40 262 Q48 266 52 256 L51 240 Z",
    "M57 248 Q50 280 54 322 Q58 344 68 352 L90 352 Q99 318 99 288 L99 256 Z",
    "M66 350 Q60 380 64 414 L72 424 L88 424 Q92 392 90 352 Z",
    "M66 422 L90 422 Q93 432 86 437 L64 437 Q61 430 66 422 Z",
  ];

  // Мышцы левой половины фигуры. a — точка, к которой ведёт линия подписи; side — с какой стороны подпись (l/r);
  // lines — линии рельефа внутри мышцы (кубики пресса, разделение бедра), они не мешают нажатию.
  const MUSCLES = {
    front: [
      { m: "neck", d: ["M90 58 Q89 68 93 82 L99 82 Q98 68 97 57 Z"], a: [95, 70], side: "l" },
      { m: "traps", d: ["M90 70 Q80 77 64 86 L84 86 Q90 81 93 75 Z"], a: [80, 82], side: "r" },
      { m: "shoulders", d: ["M64 86 Q51 88 46 102 Q43 118 49 133 Q56 125 60 114 Q66 100 76 90 Z"], a: [52, 106], side: "l" },
      { m: "chest", d: ["M99 88 L77 88 Q64 96 60 115 Q62 127 70 133 Q86 139 99 135 Z"], a: [82, 112], side: "r" },
      { m: "biceps", d: ["M49 135 Q42 151 43 170 Q46 182 55 185 Q61 170 61 150 Q59 139 53 133 Z"], a: [51, 160], side: "l" },
      { m: "abs", d: ["M99 139 L83 139 Q79 172 81 230 L99 242 Z"], a: [91, 186], side: "r",
        lines: ["M83 159 L99 159", "M82 180 L99 180", "M82 201 L99 201", "M99 141 L99 240"] },
      { m: "obliques", d: ["M81 141 Q69 137 62 141 Q60 172 64 202 Q68 223 81 232 Q78 190 81 141 Z"], a: [70, 182], side: "l" },
      { m: "quads", d: ["M60 252 Q52 282 56 320 Q60 340 71 348 L86 348 Q95 318 96 290 Q96 268 92 256 Z"], a: [72, 296], side: "l",
        lines: ["M77 262 Q74 300 80 344"] },
      { m: "calves", d: ["M67 360 Q60 384 65 406 L72 412 Q75 388 73 362 Z", "M87 360 Q93 382 88 402 L82 408 Q80 384 81 362 Z"], a: [69, 388], side: "r" },
    ],
    back: [
      { m: "traps", d: ["M100 60 L92 62 Q86 74 63 86 Q80 96 91 120 L100 168 Z"], a: [88, 96], side: "l" },
      { m: "shoulders", d: ["M63 86 Q49 90 46 104 Q46 118 50 129 Q58 119 64 105 Q70 95 74 90 Z"], a: [53, 106], side: "l" },
      { m: "triceps", d: ["M49 131 Q42 151 44 172 Q48 184 57 185 Q61 166 59 147 Q57 137 51 131 Z"], a: [51, 160], side: "l" },
      { m: "lats", d: ["M65 105 Q60 131 66 161 Q74 191 90 209 L98 201 Q96 177 92 157 Q86 129 73 112 Z"], a: [78, 160], side: "r" },
      { m: "lower_back", d: ["M99 172 L89 174 Q86 202 88 233 L99 237 Z"], a: [94, 206], side: "l" },
      { m: "glutes", d: ["M58 238 Q53 262 62 281 Q79 292 99 285 L99 240 Q80 233 58 238 Z"], a: [78, 264], side: "l",
        lines: ["M99 240 L99 285"] },
      { m: "hamstrings", d: ["M60 288 Q54 312 60 340 L73 349 L86 349 Q96 320 97 291 Q80 297 60 288 Z"], a: [78, 318], side: "r",
        lines: ["M79 296 Q78 322 80 346"] },
      { m: "calves", d: ["M66 360 Q58 383 66 407 L79 413 Q90 392 88 367 Q78 358 66 360 Z"], a: [76, 384], side: "r",
        lines: ["M77 362 L77 410"] },
    ],
  };

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MIRROR = 'transform="translate(200,0) scale(-1,1)"';
  // Подпись в одну-три строки: длинные названия переносятся по словам.
  function wrap(text, max) {
    const words = String(text).split(" "), lines = [""];
    words.forEach(w => { const cur = lines[lines.length - 1]; if (cur && (cur + " " + w).length > max) lines.push(w); else lines[lines.length - 1] = cur ? cur + " " + w : w; });
    return lines.slice(0, 3);
  }
  // Подписи одной стороны раскладываются по вертикали без наложения: не ближе 30 единиц друг к другу.
  function layout(items) {
    const out = items.map(x => ({ x, y: x.a[1] + FY })).sort((p, q) => p.y - q.y);
    for (let i = 1; i < out.length; i++) if (out[i].y - out[i - 1].y < 34) out[i].y = out[i - 1].y + 34;
    return out;
  }

  // labels: { muscleId: "название" }. Возвращает пустую строку для неизвестного вида.
  function svg(view, selected, labels) {
    const list = MUSCLES[view];
    if (!list) return "";
    const name = m => (labels && labels[m]) || m;
    const base = SILHOUETTE.map(d => `<path class="bs-base" d="${d}"/><path class="bs-base" d="${d}" ${MIRROR}/>`).join("");
    const muscles = list.map(z => {
      const on = z.m === selected;
      const half = z.d.map(d => `<path d="${d}"/>`).join("") + (z.lines || []).map(d => `<path class="fib" d="${d}"/>`).join("");
      return `<g class="mz${on ? " on" : ""}" data-m="${z.m}" role="button" tabindex="0" aria-pressed="${on}" aria-label="${esc(name(z.m))}"><title>${esc(name(z.m))}</title>` +
        half + `<g ${MIRROR}>${half}</g></g>`;
    }).join("");
    // Подписи: слева — к точке на левой половине фигуры, справа — к зеркальной точке на правой половине.
    const callouts = ["l", "r"].map(side => layout(list.filter(z => z.side === side)).map(({ x: z, y }) => {
      const on = z.m === selected, ax = FX + (side === "l" ? z.a[0] : 200 - z.a[0]), ay = FY + z.a[1];
      const tx = side === "l" ? 8 : W - 8, lx = side === "l" ? 100 : W - 100;
      const lines = wrap(name(z.m), 13);
      const text = lines.map((t, i) => `<tspan x="${tx}" dy="${i ? 14 : 0}">${esc(t)}</tspan>`).join("");
      return `<g class="ml${on ? " on" : ""}" data-m="${z.m}" aria-hidden="true">` +
        `<path class="ml-line" d="M${lx} ${y - 4} L${ax} ${ay}"/><circle class="ml-dot" cx="${ax}" cy="${ay}" r="2.5"/>` +
        `<text x="${tx}" y="${y - 4 - (lines.length - 1) * 7}" text-anchor="${side === "l" ? "start" : "end"}">${text}</text></g>`;
    }).join("")).join("");
    return `<svg class="body-svg" viewBox="0 0 ${W} ${H}" role="group" aria-label="${view === "front" ? "Вид спереди" : "Вид сзади"}">` +
      `<g transform="translate(${FX},${FY})">${base}${muscles}</g>${callouts}</svg>`;
  }

  const musclesIn = view => Array.from(new Set((MUSCLES[view] || []).map(z => z.m)));
  const api = { svg, musclesIn, VIEWS: Object.keys(MUSCLES) };
  root.Body = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
