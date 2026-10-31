// Линейные значки (24×24, цвет берут из текста). Рисуются как SVG на месте, без файлов и без картинок.
(function (root) {
  "use strict";
  const P = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V10"/>',
    dumbbell: '<path d="M7 6.5v11M17 6.5v11M3.5 9.5v5M20.5 9.5v5M7 12h10"/>',
    food: '<path d="M7 3v7a2.5 2.5 0 0 0 5 0V3M9.5 3v18"/><path d="M17.5 21V3c-2.2 1.2-3.5 3.8-3.5 7v3h3.5"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H4.5v1.5A3.5 3.5 0 0 0 8 11M16 6h3.5v1.5A3.5 3.5 0 0 1 16 11M12 13v4M8.5 20.5h7M10 17h4"/>',
    user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5c.6-3.7 3.7-6 7.5-6s6.9 2.3 7.5 6"/>',
    moon: '<path d="M20 14.2A8 8 0 1 1 9.8 4a6.4 6.4 0 0 0 10.2 10.2z"/>',
    activity: '<path d="M3 12h4l2.5-7 5 14 2.5-7H21"/>',
    chat: '<path d="M20.5 12a8 8 0 0 1-11.7 7.1L4 20.5l1.5-4.3A8 8 0 1 1 20.5 12z"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
    flame: '<path d="M12 3c.6 3.6 4.5 5 4.5 9.6A4.5 4.5 0 0 1 12 17a4.5 4.5 0 0 1-4.5-4.4c0-1.8.8-3 1.8-4 .1 1.6.9 2.5 1.8 2.8C11 8.5 10.4 5.8 12 3z"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 16.8v.2"/>',
    download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14"/>',
    diamond: '<path d="M6.5 4h11l3.5 5-9 11L3 9l3.5-5z"/><path d="M3 9h18M9.5 4 8 9l4 11 4-11-1.5-5"/>',
    cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 10.5a4 4 0 0 1-.5 8H7z"/>',
    bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3z"/>',
    leaf: '<path d="M5 19c0-8 4.5-13 14-14 0 9.5-5 14-12.5 14"/><path d="M5 19c2-4 5-7 9-9"/>',
    scale: '<rect x="3.5" y="4.5" width="17" height="15" rx="3.5"/><path d="M8.5 9.5a4.5 4.5 0 0 1 7 0M12 9.5l1.7-1.6"/>',
    star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8L12 3.5z"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="15" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    book: '<path d="M5 4.5h10a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3V4.5z"/><path d="M8 17h10"/>',
    volume: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
    mute: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8"/>',
  };
  const svg = (name, size) => P[name]
    ? `<svg class="ic" width="${size || 22}" height="${size || 22}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name]}</svg>`
    : "";
  // Заполняет все элементы с data-ic="имя" значком.
  function fill(doc) {
    if (!doc || !doc.querySelectorAll) return;
    doc.querySelectorAll("[data-ic]").forEach(el => { if (!el.firstChild) el.innerHTML = svg(el.dataset.ic, +el.dataset.size || undefined); });
  }
  const api = { names: Object.keys(P), svg, fill };
  root.Icons = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
