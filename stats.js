// Статистика тренировок: тоннаж (вес × повторения), время, подходы, нагрузка по мышцам и уровни мышц. Чистые функции, без страницы.
// Тренировка (session): { id, date: "YYYY-MM-DD", durationSec, title, items: [{ ex, name, sets: [{ reps, kg }] }] }.
// Отметки готовых программ без записи подходов (log) считаются тренировками, но не дают ни веса, ни времени: их никто не измерял.
(function (root) {
  "use strict";

  // Уровни мышцы по числу рабочих подходов в неделю (среднее за период). Ориентир, а не норма: 10–20 подходов на мышцу в неделю
  // часто называют хорошим объёмом для роста, меньше — поддержка, больше 20 — уже много для новичка.
  const LEVELS = [
    { id: 0, label: "Нет нагрузки", min: 0 },
    { id: 1, label: "Дерево", min: 0.01 },
    { id: 2, label: "Бронза", min: 5 },
    { id: 3, label: "Серебро", min: 10 },
    { id: 4, label: "Золото", min: 15 },
  ];
  const levelFor = setsPerWeek => LEVELS.reduce((lvl, l) => (setsPerWeek >= l.min && setsPerWeek > 0 ? l.id : lvl), 0);

  const dayNum = d => {
    if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    const t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
    return Number.isFinite(t) ? Math.round(t / 86400000) : null;
  };
  const dayStr = n => new Date(n * 86400000).toISOString().slice(0, 10);

  const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
  // Подходы с реальными повторениями; вес 0 (своё тело) допустим.
  const setsOf = it => (it && Array.isArray(it.sets) ? it.sets.filter(s => s && num(s.reps) > 0) : []);
  const items = s => (s && Array.isArray(s.items) ? s.items : []);
  function volume(session) {
    let sets = 0, reps = 0, kg = 0;
    items(session).forEach(it => setsOf(it).forEach(s => { sets++; reps += num(s.reps); kg += num(s.reps) * Math.max(0, num(s.kg)); }));
    return { sets, reps, tonnage: Math.round(kg * 10) / 10 };
  }
  // Подходы по мышцам: подход засчитывается каждой основной мышце упражнения. muscleOf(ex) → список id мышц.
  function muscleSets(session, muscleOf) {
    const out = {};
    items(session).forEach(it => { const n = setsOf(it).length; if (n) (muscleOf(it.ex) || []).forEach(m => { out[m] = (out[m] || 0) + n; }); });
    return out;
  }

  const PERIODS = { week: 7, month: 30, year: 365, all: null };
  const inWindow = (date, todayNum, days) => { const n = dayNum(date); return n !== null && n <= todayNum && (days === null || n > todayNum - days); };

  // sessions, log — массивы из состояния; period — week | month | year | all.
  // markSets(отметка) → { мышца: подходов } или null: примерная нагрузка отмеченной программы или быстрой отметки без записи подходов.
  function summarize(sessions, log, period, todayNum, muscleOf, markSets) {
    const days = PERIODS[period] === undefined ? 30 : PERIODS[period];
    const ss = (sessions || []).filter(s => inWindow(s.date, todayNum, days));
    // Отметка программы без подходов — тренировка; но если к ней записана сессия (sid) или это запись из логгера (free), она уже учтена.
    const marks = (log || []).filter(l => !l.sid && l.p !== "free" && inWindow(l.date, todayNum, days));
    let sets = 0, kg = 0, sec = 0;
    const muscles = {};
    ss.forEach(s => {
      const v = volume(s); sets += v.sets; kg += v.tonnage; sec += Math.max(0, num(s.durationSec));
      const ms = muscleSets(s, muscleOf || (() => []));
      Object.keys(ms).forEach(m => { muscles[m] = (muscles[m] || 0) + ms[m]; });
    });
    const est = {};
    if (markSets) marks.forEach(l => { const ms = markSets(l); if (ms) Object.keys(ms).forEach(m => { muscles[m] = (muscles[m] || 0) + ms[m]; est[m] = (est[m] || 0) + ms[m]; }); });
    // Длина периода для «подходов в неделю»: у «всего» это время от первой тренировки (не меньше недели).
    let span = days;
    if (days === null) {
      const first = ss.map(s => dayNum(s.date)).filter(n => n !== null).sort((a, b) => a - b)[0];
      span = first === undefined ? 7 : Math.max(7, todayNum - first + 1);
    }
    const weeks = Math.max(1, span / 7);
    const byMuscle = {};
    Object.keys(muscles).forEach(m => { const perWeek = muscles[m] / weeks; byMuscle[m] = { sets: muscles[m], perWeek: Math.round(perWeek * 10) / 10, level: levelFor(perWeek), est: est[m] || 0 }; });
    return { workouts: ss.length + marks.length, sessions: ss.length, marks: marks.length, estimated: Object.keys(est).length > 0, sets, tonnage: Math.round(kg * 10) / 10, seconds: sec, minutes: Math.round(sec / 60), byMuscle };
  }
  const levelCounts = byMuscle => { const c = { 1: 0, 2: 0, 3: 0, 4: 0 }; Object.keys(byMuscle || {}).forEach(m => { const l = byMuscle[m].level; if (l > 0) c[l]++; }); return c; };

  // Последние недели для столбиков: от старых к новым, неделя — 7 дней, последняя заканчивается сегодня.
  function weekly(sessions, log, todayNum, count) {
    const out = [];
    for (let i = count - 1; i >= 0; i--) {
      const hi = todayNum - i * 7, lo = hi - 6;
      const inRange = d => { const n = dayNum(d); return n !== null && n >= lo && n <= hi; };
      const ss = (sessions || []).filter(s => inRange(s.date));
      const marks = (log || []).filter(l => !l.sid && l.p !== "free" && inRange(l.date));
      out.push({ from: dayStr(lo), workouts: ss.length + marks.length, tonnage: Math.round(ss.reduce((a, s) => a + volume(s).tonnage, 0)), minutes: Math.round(ss.reduce((a, s) => a + Math.max(0, num(s.durationSec)), 0) / 60) });
    }
    return out;
  }

  const nbsp = " ";
  // Вес: до тонны — в килограммах, дальше — в тоннах с одной цифрой после запятой.
  function fmtKg(kg) {
    const v = Math.max(0, num(kg));
    if (v < 1000) return (Math.round(v * 10) / 10).toString().replace(".", ",") + nbsp + "кг";
    return (Math.round(v / 100) / 10).toString().replace(".", ",") + nbsp + "т";
  }
  function fmtTime(sec) {
    const m = Math.round(Math.max(0, num(sec)) / 60);
    if (m < 60) return m + nbsp + "мин";
    const h = Math.floor(m / 60), r = m % 60;
    return h + nbsp + "ч" + (r ? nbsp + r + nbsp + "мин" : "");
  }
  const fmtClock = sec => { const s = Math.max(0, Math.floor(num(sec))), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(r).padStart(2, "0"); };

  // Короткая запись для сообщения тренеру: упражнения с подходами и итоги.
  function summaryText(session, dateLabel) {
    const v = volume(session), lines = [];
    items(session).forEach(it => {
      const ss = setsOf(it);
      if (ss.length) lines.push(it.name + ": " + ss.map(s => (num(s.kg) > 0 ? s.reps + "×" + num(s.kg).toString().replace(".", ",") : s.reps + " повт.")).join(", "));
    });
    const tail = "\nИтого: " + v.sets + " подходов, " + fmtKg(v.tonnage).replace(nbsp, " ") + ", " + fmtTime(session.durationSec).replace(/\u00A0/g, " ") + ".";
    let body = "Тренировка" + (dateLabel ? " " + dateLabel : "") + ": " + session.title + "\n" + lines.join("\n");
    // Сообщение тренеру не длиннее 2000 символов: длинный список упражнений обрезается, итог остаётся.
    if (body.length + tail.length > 1990) body = body.slice(0, 1990 - tail.length - 2).replace(/\n[^\n]*$/, "") + "\n…";
    return body + tail;
  }

  const api = { LEVELS, levelFor, dayNum, dayStr, volume, muscleSets, summarize, levelCounts, weekly, fmtKg, fmtTime, fmtClock, summaryText, PERIODS };
  root.Stats = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
