// Пресс и широчайшие для 3D-модели (в BodyParts3D их нет).
// Пресс: средняя передняя часть сухожильной пластины наружных косых мышц, под которой лежит прямая мышца живота, —
//   её треугольники переносятся из группы «косые» в группу «пресс».
// Широчайшие: тонкий пласт по форме спины модели (поверхность берётся из соседних мышц и рёбер), от середины спины
//   и таза к подмышке, с обеих сторон. Трапеция поверх пласта остаётся видна.
import { collect } from "./build-anatomy.mjs";

const tri = (m, t) => [m.idx[t], m.idx[t + 1], m.idx[t + 2]];
const P = (m, i) => [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]];
function bounds(m) {
  const b = { minY: Infinity, maxY: -Infinity, minX: Infinity, maxX: -Infinity };
  for (let i = 0; i < m.pos.length; i += 3) { b.minY = Math.min(b.minY, m.pos[i + 1]); b.maxY = Math.max(b.maxY, m.pos[i + 1]); b.minX = Math.min(b.minX, m.pos[i]); b.maxX = Math.max(b.maxX, m.pos[i]); }
  return b;
}
// Детали скелета для ориентиров, в той же рамке, что и модель.
function landmark(names, frame) {
  const m = collect(names, "ориентир");
  for (let i = 0; i < m.pos.length; i += 3) { m.pos[i] -= frame.cx; m.pos[i + 1] -= frame.minY; m.pos[i + 2] -= frame.cz; }
  return bounds(m);
}

export function sculpt(parts, frame) {
  const out = {};
  // ---- пресс ----
  const obl = parts.m_obliques, ster = landmark(["sternum"], frame), hip = landmark(["left hip bone", "right hip bone"], frame);
  const top = ster.minY + 0.01, bottom = hip.maxY - 0.08;
  const keep = [], abs = { pos: obl.pos, idx: [], sculpted: false };
  for (let t = 0; t < obl.idx.length; t += 3) {
    const [a, b, c] = tri(obl, t), pa = P(obl, a), pb = P(obl, b), pc = P(obl, c);
    const cx = (pa[0] + pb[0] + pc[0]) / 3, cy = (pa[1] + pb[1] + pc[1]) / 3;
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const nz = u[0] * v[1] - u[1] * v[0], len = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], nz) || 1;
    // ширина прямой мышцы: около 7 см от средней линии, у лобка уже
    const k = Math.min(1, Math.max(0, (cy - bottom) / (top - bottom))), half = 0.045 + 0.03 * k;
    if (cy < top && cy > bottom - 0.04 && Math.abs(cx) < half && nz / len > 0.25) abs.idx.push(a, b, c); else keep.push(a, b, c);
  }
  obl.idx = keep;
  out.m_abs = abs;

  // ---- широчайшие ----
  const scap = landmark(["left scapula", "right scapula"], frame);
  const yLow = hip.maxY - 0.02, yAx = scap.minY + 0.6 * (scap.maxY - scap.minY);
  // Поверхность спины: самая задняя точка мышц (кроме трапеции) и рёбер в каждой клетке сетки 1 см.
  const src = ["m_lower_back", "base_muscle", "m_obliques", "bone"].map(k => parts[k]).filter(Boolean);
  const C = 0.01, back = new Map(), key = (i, j) => i + ":" + j;
  for (const m of src) for (let i = 0; i < m.pos.length; i += 3) {
    const x = m.pos[i], y = m.pos[i + 1], z = m.pos[i + 2];
    if (y < yLow - 0.05 || y > yAx + 0.05 || Math.abs(x) > 0.22 || z > 0.02) continue;
    const kk = key(Math.round(x / C), Math.round(y / C));
    if (!back.has(kk) || z < back.get(kk)) back.set(kk, z);
  }
  // Самая задняя точка в радиусе 2 см: пласт ложится поверх выступов, а не проваливается между ними.
  const zAt = (x, y) => {
    for (let r = 2; r <= 4; r++) {
      let best = Infinity;
      for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) { const z = back.get(key(Math.round(x / C) + di, Math.round(y / C) + dj)); if (z !== undefined && z < best) best = z; }
      if (best < Infinity) return best;
    }
    return null;
  };
  // Контур правой широчайшей в плоскости спины (x, y); левая — зеркало.
  const lat = { pos: [], idx: [], sculpted: true };
  const NX = 24, NY = 44;
  // Каждая строка сетки идёт от внутреннего края мышцы к наружному: контур плавный, без ступенек.
  // Снизу мышца широкая (от позвоночника до бока), кверху сужается и уходит к подмышке.
  const edges = t => {
    // Снизу мышца начинается у поясницы (мышцы вдоль позвоночника остаются открыты), выше её край идёт косо к подмышке:
    // верхний внутренний угол у настоящей широчайшей закрыт трапецией, поэтому пласт его не повторяет.
    const inner = t < 0.3 ? 0.04 : 0.04 + (t - 0.3) / 0.7 * 0.1;
    const outer = 0.075 + 0.08 * Math.sin(Math.min(1, t * 1.4) * Math.PI / 2); // внизу уже, к середине спины шире
    return [inner, outer];
  };
  for (const side of [1, -1]) {
    const base = lat.pos.length / 3, grid = [];
    for (let j = 0; j <= NY; j++) {
      grid.push([]);
      const tt = j / NY, y = yLow + tt * (yAx - yLow), [x0, x1] = edges(tt);
      for (let i = 0; i <= NX; i++) {
        const x = x0 + i / NX * (x1 - x0), z = zAt(x * side, y);
        if (z === null) { grid[j].push(-1); continue; }
        grid[j].push(lat.pos.length / 3);
        lat.pos.push(x * side, y, z);
      }
    }
    // Сглаживание пласта: усреднение по соседям много раз, затем отступ наружу, чтобы гладкий пласт не уходил в мышцы под ним.
    for (let pass = 0; pass < 24; pass++) {
      const nz = [];
      for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
        const v = grid[j][i]; if (v < 0) continue;
        let s = 0, n = 0;
        for (const [dj, di] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const w = grid[j + dj] && grid[j + dj][i + di]; if (w !== undefined && w >= 0) { s += lat.pos[w * 3 + 2]; n++; } }
        nz.push([v, pass < 3 ? Math.min(lat.pos[v * 3 + 2], s / n) : s / n]);
      }
      nz.forEach(([v, z]) => { lat.pos[v * 3 + 2] = z; });
    }
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
      const v = grid[j][i]; if (v < 0) continue;
      lat.pos[v * 3 + 2] -= 0.016;
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i], d = grid[j + 1][i + 1];
      if (a < 0 || b < 0 || c < 0 || d < 0) continue;
      // треугольники наружу (к спине): порядок обхода зависит от стороны
      if (side > 0) lat.idx.push(a, c, b, b, c, d); else lat.idx.push(a, b, c, b, d, c);
    }
    if (lat.pos.length / 3 === base) console.log("  широчайшие: не нашлась поверхность спины");
  }
  out.m_lats = lat;
  console.log("  пресс:", abs.idx.length / 3, "треугольников; широчайшие:", lat.idx.length / 3);
  return out;
}
