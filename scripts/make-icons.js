// Рисует иконки приложения (PNG) без внешних библиотек: кольцо активности и гантель на тёмном фоне.
// Запуск: node scripts/make-icons.js. Результат лежит в icons/ и закоммичен; скрипт нужен, чтобы пересобрать иконки.
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const OUT = path.join(__dirname, "..", "icons");

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y), o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const BG1 = [10, 14, 19], BG2 = [18, 58, 58], ACC = [62, 224, 164], ACC2 = [34, 211, 238], TRK = [255, 255, 255];
const inRound = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

// x, y в долях 0..1. rounded — прозрачные скруглённые углы (для обычных иконок), иначе фон до краёв.
function sample(x, y, rounded) {
  if (rounded && !inRound(x, y, 0, 0, 1, 1, 0.22)) return [0, 0, 0, 0];
  // Ярче, если выше и левее — мягкое свечение.
  let c = mix(BG1, BG2, Math.min(1, (x + y) / 1.6));
  const glow = Math.max(0, 1 - Math.hypot(x - 0.25, y - 0.2) / 0.6);
  c = mix(c, [40, 120, 110], glow * 0.35);
  const dx = x - 0.5, dy = y - 0.5, d = Math.hypot(dx, dy);
  const R = 0.32, W = 0.075;
  if (Math.abs(d - R) <= W / 2) {
    let ang = Math.atan2(dy, dx) + Math.PI / 2; // 0 сверху, по часовой
    if (ang < 0) ang += Math.PI * 2;
    if (ang / (Math.PI * 2) <= 0.78) c = mix(ACC, ACC2, (x + y) / 2);
    else c = mix(c, TRK, 0.14);
  }
  // Гантель в центре: гриф и по две пластины с каждой стороны.
  const bar = inRound(x, y, 0.36, 0.485, 0.64, 0.515, 0.015);
  const plates = [[0.385, 0.42, 0.415, 0.58], [0.585, 0.42, 0.615, 0.58], [0.345, 0.45, 0.375, 0.55], [0.625, 0.45, 0.655, 0.55]]
    .some(p => inRound(x, y, p[0], p[1], p[2], p[3], 0.012));
  if (bar || plates) c = [244, 249, 252];
  return [c[0], c[1], c[2], 255];
}
function icon(size, rounded) {
  const N = 4;
  return png(size, (px, py) => {
    let r = 0, g = 0, b = 0, a = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const s = sample((px + (i + 0.5) / N) / size, (py + (j + 0.5) / N) / size, rounded);
      r += s[0] * s[3]; g += s[1] * s[3]; b += s[2] * s[3]; a += s[3];
    }
    return a ? [Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(a / (N * N))] : [0, 0, 0, 0];
  });
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "icon-192.png"), icon(192, true));
fs.writeFileSync(path.join(OUT, "icon-512.png"), icon(512, true));
fs.writeFileSync(path.join(OUT, "icon-maskable-512.png"), icon(512, false));
fs.writeFileSync(path.join(OUT, "apple-touch-icon.png"), icon(180, false));
fs.writeFileSync(path.join(OUT, "favicon-32.png"), icon(32, true));
console.log("icons ok");
