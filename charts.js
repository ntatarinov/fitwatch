// График веса: чистая функция, возвращает разметку SVG. items — [{day: "YYYY-MM-DD", value: число}] по возрастанию даты.
(function (root) {
  "use strict";
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const t = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  const fmt = d => d.slice(8, 10) + "." + d.slice(5, 7);

  function line(items, unit) {
    if (!items || !items.length) return "";
    const W = 320, H = 150, L = 36, R = 12, T = 14, B = 26;
    const vs = items.map(i => i.value);
    let lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
    if (hi - lo < 1) { lo -= 0.5; hi += 0.5; }
    const pad = (hi - lo) * 0.15; lo -= pad; hi += pad;
    const t0 = t(items[0].day), t1 = t(items[items.length - 1].day);
    const X = d => L + (t1 === t0 ? (W - L - R) / 2 : (t(d) - t0) / (t1 - t0) * (W - L - R));
    const Y = v => T + (hi - v) / (hi - lo) * (H - T - B);
    const pts = items.map(i => X(i.day).toFixed(1) + "," + Y(i.value).toFixed(1));
    const area = "M" + pts[0] + " L" + pts.join(" L") + " L" + X(items[items.length - 1].day).toFixed(1) + "," + (H - B) + " L" + X(items[0].day).toFixed(1) + "," + (H - B) + " Z";
    const dots = items.map(i => '<circle class="ch-dot" cx="' + X(i.day).toFixed(1) + '" cy="' + Y(i.value).toFixed(1) + '" r="3.5"><title>' + esc(fmt(i.day) + ": " + i.value + " " + (unit || "")) + "</title></circle>").join("");
    const mid = (lo + hi) / 2;
    const grid = [hi, mid, lo].map(v => '<line class="ch-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text class="ch-lab" x="' + (L - 4) + '" y="' + (Y(v) + 3).toFixed(1) + '" text-anchor="end">' + (Math.round(v * 10) / 10) + "</text>").join("");
    const xl = '<text class="ch-lab" x="' + L + '" y="' + (H - 8) + '">' + fmt(items[0].day) + '</text>' + (items.length > 1 ? '<text class="ch-lab" x="' + (W - R) + '" y="' + (H - 8) + '" text-anchor="end">' + fmt(items[items.length - 1].day) + "</text>" : "");
    return '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="График: ' + items.length + ' замеров"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent)" stop-opacity=".28"/><stop offset="1" style="stop-color:var(--accent)" stop-opacity="0"/></linearGradient></defs>' +
      grid + (items.length > 1 ? '<path d="' + area + '" fill="url(#cg)"/><polyline class="ch-line" fill="none" points="' + pts.join(" ") + '"/>' : "") + dots + xl + "</svg>";
  }
  const api = { line };
  root.Charts = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
