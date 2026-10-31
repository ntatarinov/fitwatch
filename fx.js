// Эффекты мотивации: звуки (синтез в браузере, без файлов), конфетти, всплывающие подсказки, счётчик, вибрация.
// Всё безопасно отключается: без звука, без анимации (prefers-reduced-motion) и там, где нет Web Audio или canvas.
(function (root) {
  "use strict";
  const KEY = "fitwatch.sound";
  const doc = root.document;
  let ctx = null;

  const reduce = () => !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  function enabled() { try { return root.localStorage.getItem(KEY) !== "off"; } catch (e) { return true; } }
  function setEnabled(v) { try { root.localStorage.setItem(KEY, v ? "on" : "off"); } catch (e) { /* без хранилища звук просто включён */ } }

  // Звук можно запускать только после действия человека (правило браузеров): контекст создаётся при первом вызове.
  function audio() {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === "suspended" && ctx.resume) ctx.resume();
    return ctx;
  }

  // Ноты: [частота Гц, начало с, длительность с, форма, громкость]
  const SOUNDS = {
    tap: [[720, 0, 0.05, "sine", 0.05]],
    done: [[523.25, 0, 0.12], [659.25, 0.1, 0.12], [783.99, 0.2, 0.14], [1046.5, 0.32, 0.45]],
    level: [[392, 0, 0.12], [523.25, 0.12, 0.12], [659.25, 0.24, 0.12], [783.99, 0.36, 0.12], [1046.5, 0.48, 0.55]],
    badge: [[880, 0, 0.1], [1318.5, 0.1, 0.32]],
  };

  function play(name) {
    const notes = SOUNDS[name];
    if (!notes || !enabled()) return false;
    const c = audio();
    if (!c) return false;
    const t = c.currentTime;
    notes.forEach(n => {
      const at = n[1], d = n[2], v = n[4] || 0.11;
      const o = c.createOscillator(), g = c.createGain();
      o.type = n[3] || "triangle";
      o.frequency.value = n[0];
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(v, t + at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + d);
      o.connect(g); g.connect(c.destination);
      o.start(t + at); o.stop(t + at + d + 0.05);
    });
    return true;
  }

  function vibrate(p) { try { if (enabled() && root.navigator && root.navigator.vibrate) root.navigator.vibrate(p); } catch (e) { /* не везде есть */ } }

  function confetti() {
    if (!doc || reduce()) return false;
    const cv = doc.createElement("canvas");
    const g = cv.getContext && cv.getContext("2d");
    if (!g) return false;
    const dpr = Math.min(2, root.devicePixelRatio || 1), w = root.innerWidth || 360, h = root.innerHeight || 640;
    cv.className = "confetti";
    cv.setAttribute("aria-hidden", "true");
    cv.width = w * dpr; cv.height = h * dpr;
    g.scale(dpr, dpr);
    doc.body.appendChild(cv);
    const colors = ["#FF6A2B", "#FFB020", "#2F6BFF", "#12B76A", "#F472B6", "#14141A"];
    const parts = Array.from({ length: 150 }, () => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9, sp = 7 + Math.random() * 9;
      return { x: w / 2, y: h * 0.62, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[(Math.random() * colors.length) | 0] };
    });
    const raf = root.requestAnimationFrame || (f => setTimeout(f, 16));
    const t0 = Date.now();
    (function frame() {
      const age = Date.now() - t0;
      g.clearRect(0, 0, w, h);
      parts.forEach(p => {
        p.vy += 0.28; p.vx *= 0.992; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        g.save(); g.translate(p.x, p.y); g.rotate(p.r);
        g.globalAlpha = Math.max(0, 1 - age / 2600);
        g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.6); g.restore();
      });
      if (age < 2600) raf(frame); else if (cv.parentNode) cv.parentNode.removeChild(cv);
    })();
    return true;
  }

  let toasts = null;
  function toast(text, icon) {
    if (!doc) return;
    if (!toasts || !toasts.parentNode) {
      toasts = doc.createElement("div");
      toasts.className = "toasts"; toasts.setAttribute("role", "status"); toasts.setAttribute("aria-live", "polite");
      doc.body.appendChild(toasts);
    }
    while (toasts.children.length >= 3) toasts.removeChild(toasts.firstChild);
    const el = doc.createElement("div");
    el.className = "toast";
    if (icon && root.Icons && root.Icons.names.includes(icon)) { const i = doc.createElement("span"); i.className = "t-ic"; i.innerHTML = root.Icons.svg(icon, 18); el.appendChild(i); }
    const tx = doc.createElement("span"); tx.textContent = text; el.appendChild(tx);
    toasts.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 4200);
  }

  // Плавный счётчик: от from до to за ms миллисекунд; без анимации просто ставит число.
  function countUp(el, from, to, ms, suffix) {
    const set = v => { el.textContent = Math.round(v) + (suffix || ""); };
    const raf = root.requestAnimationFrame;
    if (!raf || reduce() || from === to) { set(to); return; }
    const t0 = Date.now();
    (function step() {
      const k = Math.min(1, (Date.now() - t0) / (ms || 800));
      set(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf(step);
    })();
  }

  function celebrate() { confetti(); play("done"); vibrate([30, 40, 70]); }

  const api = { enabled, setEnabled, play, confetti, toast, countUp, vibrate, celebrate, reduce, SOUNDS };
  root.FX = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
