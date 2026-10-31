// Проверка входных данных на сервере: тип, длина, диапазон. Возвращают null, если значение неверно.
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const SLUG = /^[a-z0-9_-]{1,24}$/;

// Длина считается в символах, как в базе (char_length): эмодзи — один символ, а не два. Нулевой символ база не принимает.
function str(v, min, max) {
  if (typeof v !== "string" || v.includes("\u0000")) return null;
  const s = v.trim(), n = [...s].length;
  return n >= min && n <= max ? s : null;
}
function int(v, min, max) {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}
function num(v, min, max) {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(String(v).replace(",", ".")) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 10) / 10;
}
const email = v => { const s = str(v, 5, 254); return s && EMAIL.test(s) ? s.toLowerCase() : null; };
const slug = v => (typeof v === "string" && SLUG.test(v) ? v : null);
const oneOf = (v, list) => (list.includes(v) ? v : null);

// Дата YYYY-MM-DD → номер дня с 1970-01-01 (null, если даты не существует).
function dayNum(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return Math.round(t / 86400000);
}
const dayStr = n => new Date(n * 86400000).toISOString().slice(0, 10);

module.exports = { str, int, num, email, slug, oneOf, dayNum, dayStr };
