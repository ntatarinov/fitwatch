// 3D-манекен: тело из гладких объёмных форм, основные поверхностные мышцы — отдельные детали. Крутится пальцем или мышью,
// мышца выбирается нажатием. Библиотека Three.js грузится только когда человек открывает 3D; без WebGL или без сети — честный отказ.
// Данные фигуры (PARTS, MUSCLES) — чистые и проверяются тестом; отрисовка в mount().
(function (root) {
  "use strict";
  const SRC = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";

  // Единицы — метры, рост около 1,8. Эллипсоид: p — центр, s — полуоси, r — поворот (рад). Конечность: от a до b, радиусы ra/rb.
  // mirror: true — деталь повторяется зеркально справа (x → −x).
  const PARTS = [
    { e: { p: [0, 1.64, 0], s: [0.095, 0.115, 0.105] } },                                   // голова
    { l: { a: [0, 1.47, 0], b: [0, 1.56, 0.005], ra: 0.05, rb: 0.045 } },                    // шея
    { e: { p: [0, 1.28, 0], s: [0.175, 0.24, 0.11] } },                                     // грудная клетка
    { e: { p: [0, 1.02, 0], s: [0.15, 0.13, 0.1] } },                                       // живот и таз
    { e: { p: [0.2, 1.42, 0], s: [0.06, 0.055, 0.06] }, mirror: true },                     // плечевой сустав
    { l: { a: [0.215, 1.4, 0], b: [0.25, 1.13, 0], ra: 0.052, rb: 0.042 }, mirror: true },  // плечо
    { l: { a: [0.25, 1.13, 0], b: [0.27, 0.88, 0.02], ra: 0.042, rb: 0.03 }, mirror: true }, // предплечье
    { e: { p: [0.275, 0.82, 0.025], s: [0.03, 0.06, 0.018] }, mirror: true },               // кисть
    { l: { a: [0.095, 0.93, 0], b: [0.105, 0.52, 0.01], ra: 0.088, rb: 0.06 }, mirror: true }, // бедро
    { l: { a: [0.105, 0.5, 0.01], b: [0.11, 0.1, 0], ra: 0.056, rb: 0.036 }, mirror: true },   // голень
    { e: { p: [0.11, 0.035, 0.04], s: [0.04, 0.03, 0.09] }, mirror: true },                  // стопа
  ];

  // Мышцы: детали чуть выступают над телом, чтобы их было видно и удобно нажимать.
  const MUSCLES = [
    { m: "neck", parts: [{ p: [0.025, 1.51, 0.035], s: [0.018, 0.05, 0.02], r: [0.2, 0, -0.35], mirror: true }] },
    { m: "traps", parts: [{ p: [0, 1.45, -0.055], s: [0.15, 0.06, 0.045] }, { p: [0, 1.36, -0.085], s: [0.07, 0.1, 0.03] }] },
    { m: "shoulders", parts: [{ p: [0.205, 1.415, 0.005], s: [0.078, 0.078, 0.076], mirror: true }] },
    { m: "chest", parts: [{ p: [0.078, 1.36, 0.086], s: [0.092, 0.066, 0.04], r: [0, 0, 0.12], mirror: true }] },
    { m: "biceps", parts: [{ p: [0.235, 1.27, 0.03], s: [0.043, 0.1, 0.038], mirror: true }] },
    { m: "triceps", parts: [{ p: [0.235, 1.28, -0.03], s: [0.045, 0.11, 0.038], mirror: true }] },
    { m: "abs", parts: [{ p: [0.032, 1.22, 0.1], s: [0.03, 0.04, 0.02], mirror: true }, { p: [0.032, 1.13, 0.098], s: [0.03, 0.04, 0.02], mirror: true }, { p: [0.032, 1.04, 0.09], s: [0.03, 0.045, 0.02], mirror: true }] },
    { m: "obliques", parts: [{ p: [0.125, 1.12, 0.05], s: [0.046, 0.11, 0.046], r: [0, 0, 0.12], mirror: true }] },
    { m: "lats", parts: [{ p: [0.11, 1.25, -0.078], s: [0.078, 0.165, 0.045], r: [0, 0, -0.25], mirror: true }] },
    { m: "lower_back", parts: [{ p: [0.03, 1.06, -0.095], s: [0.025, 0.085, 0.022], mirror: true }] },
    { m: "glutes", parts: [{ p: [0.072, 0.93, -0.08], s: [0.086, 0.088, 0.066], mirror: true }] },
    { m: "quads", parts: [{ p: [0.1, 0.72, 0.034], s: [0.082, 0.19, 0.062], mirror: true }] },
    { m: "hamstrings", parts: [{ p: [0.1, 0.71, -0.034], s: [0.076, 0.18, 0.058], mirror: true }] },
    { m: "calves", parts: [{ p: [0.11, 0.32, -0.028], s: [0.052, 0.125, 0.05], mirror: true }] },
  ];
  const muscles = () => MUSCLES.map(x => x.m);

  function hasWebGL() {
    try {
      const c = root.document.createElement("canvas");
      return !!(root.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (e) { return false; }
  }
  let loading = null;
  function load() {
    if (root.THREE) return Promise.resolve(root.THREE);
    if (loading) return loading;
    loading = new Promise((ok, fail) => {
      const s = root.document.createElement("script");
      s.src = SRC; s.async = true; s.crossOrigin = "anonymous";
      s.onload = () => (root.THREE ? ok(root.THREE) : fail(new Error("no THREE")));
      s.onerror = () => { loading = null; s.remove(); fail(new Error("load")); };
      root.document.head.appendChild(s);
    });
    return loading;
  }

  const cssColor = (name, fallback) => {
    try { const v = root.getComputedStyle(root.document.documentElement).getPropertyValue(name).trim(); return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback; } catch (e) { return fallback; }
  };

  // el — контейнер; opts: { selected, labels: {id: название}, onPick(id) }. Возвращает Promise<{ select(id), destroy() }>.
  async function mount(el, opts) {
    const o = opts || {};
    if (!hasWebGL()) throw new Error("webgl");
    const THREE = await load();
    if (!el.isConnected) throw new Error("gone");
    const names = o.labels || {};
    const colors = { base: cssColor("--bs3d", "#D9D2C6"), muscle: cssColor("--mz3d", "#C48A7B"), hover: cssColor("--mz-hover", "#F2B595"), on: cssColor("--accent-2", "#FF6A2B") };

    const W0 = () => Math.max(240, el.clientWidth || 320), H0 = () => Math.round(Math.min(520, W0() * 1.25));
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, root.devicePixelRatio || 1));
    renderer.setSize(W0(), H0());
    const canvas = renderer.domElement;
    canvas.className = "b3d-canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "3D-манекен: крути пальцем, нажми на мышцу");
    const tag = root.document.createElement("div"); tag.className = "b3d-tag"; tag.hidden = true;
    const hint = root.document.createElement("div"); hint.className = "b3d-hint"; hint.textContent = "Крути пальцем или мышью, нажми на мышцу";
    el.innerHTML = ""; el.appendChild(canvas); el.appendChild(tag); el.appendChild(hint);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, W0() / H0(), 0.1, 20);
    camera.position.set(0, 0.86, 4.05); camera.lookAt(0, 0.82, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8070, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 0.75); key.position.set(1.5, 2.5, 3); scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.35); rim.position.set(-2, 1.5, -2.5); scene.add(rim);

    const figure = new THREE.Group(); scene.add(figure);
    const geoS = new THREE.SphereGeometry(1, 40, 28), disposables = [geoS];
    const baseMat = new THREE.MeshStandardMaterial({ color: colors.base, roughness: 0.85, metalness: 0 });
    disposables.push(baseMat);
    const sides = part => (part.mirror ? [1, -1] : [1]);
    const ellipsoid = (e, sx, mat) => {
      const mesh = new THREE.Mesh(geoS, mat);
      mesh.position.set(e.p[0] * sx, e.p[1], e.p[2]); mesh.scale.set(e.s[0], e.s[1], e.s[2]);
      if (e.r) mesh.rotation.set(e.r[0], e.r[1] * sx, e.r[2] * sx);
      return mesh;
    };
    PARTS.forEach(part => sides(part).forEach(sx => {
      if (part.e) { figure.add(ellipsoid(part.e, sx, baseMat)); return; }
      const L = part.l, a = new THREE.Vector3(L.a[0] * sx, L.a[1], L.a[2]), b = new THREE.Vector3(L.b[0] * sx, L.b[1], L.b[2]);
      const len = a.distanceTo(b), g = new THREE.CylinderGeometry(L.rb, L.ra, len, 28, 1, false);
      disposables.push(g);
      const mesh = new THREE.Mesh(g, baseMat);
      mesh.position.copy(a.clone().add(b).multiplyScalar(0.5));
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      figure.add(mesh);
      [[a, L.ra], [b, L.rb]].forEach(([pt, r]) => { const s = new THREE.Mesh(geoS, baseMat); s.position.copy(pt); s.scale.setScalar(r); figure.add(s); });
    }));

    // Мышцы: у каждой свой материал, чтобы подсветка не задевала другие.
    const groups = {}, meshes = [];
    MUSCLES.forEach(mu => {
      const mat = new THREE.MeshStandardMaterial({ color: colors.muscle, roughness: 0.6, metalness: 0 });
      disposables.push(mat);
      groups[mu.m] = mat;
      mu.parts.forEach(part => sides(part).forEach(sx => {
        const mesh = ellipsoid(part, sx, mat);
        mesh.userData.m = mu.m;
        figure.add(mesh); meshes.push(mesh);
      }));
    });

    let selected = o.selected || "", hovered = "", yaw = 0, pitch = 0, raf = 0, alive = true;
    const paint = () => Object.keys(groups).forEach(m => groups[m].color.set(m === selected ? colors.on : m === hovered ? colors.hover : colors.muscle));
    // Подпись над выбранной мышцей: проекция центра её деталей на экран.
    function placeTag() {
      if (!selected || !groups[selected]) { tag.hidden = true; return; }
      const parts = meshes.filter(x => x.userData.m === selected);
      const c = new THREE.Vector3();
      parts.forEach(x => { const w = new THREE.Vector3(); x.getWorldPosition(w); c.add(w); });
      c.multiplyScalar(1 / parts.length).project(camera);
      tag.textContent = names[selected] || selected;
      tag.style.left = ((c.x + 1) / 2 * W0()) + "px";
      tag.style.top = ((1 - c.y) / 2 * H0()) + "px";
      tag.hidden = false;
    }
    function render() { raf = 0; if (!alive) return; figure.rotation.set(pitch, yaw, 0); paint(); renderer.render(scene, camera); placeTag(); }
    const ask = () => { if (!raf && alive) raf = root.requestAnimationFrame(render); };

    // Вращение: тянем по горизонтали — поворот, по вертикали — лёгкий наклон. Короткое нажатие без сдвига — выбор мышцы.
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const hit = ev => {
      const r = canvas.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const h = ray.intersectObjects(meshes, false)[0];
      return h ? h.object.userData.m : "";
    };
    let down = null;
    const onDown = ev => { down = { x: ev.clientX, y: ev.clientY, yaw, pitch, moved: false }; if (canvas.setPointerCapture) try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* не везде */ } hint.hidden = true; };
    const onMove = ev => {
      if (down) {
        const dx = ev.clientX - down.x, dy = ev.clientY - down.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) down.moved = true;
        yaw = down.yaw + dx * 0.012; pitch = Math.max(-0.35, Math.min(0.35, down.pitch + dy * 0.004));
        ask(); return;
      }
      if (ev.pointerType === "mouse") { const m = hit(ev); if (m !== hovered) { hovered = m; canvas.style.cursor = m ? "pointer" : "grab"; ask(); } }
    };
    const onUp = ev => {
      if (down && !down.moved) { const m = hit(ev); if (m) { selected = selected === m ? "" : m; ask(); if (o.onPick) o.onPick(selected); } }
      down = null;
    };
    const onLeave = () => { if (hovered) { hovered = ""; ask(); } };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", () => { down = null; });
    canvas.addEventListener("pointerleave", onLeave);
    const ro = root.ResizeObserver ? new root.ResizeObserver(() => { renderer.setSize(W0(), H0()); camera.aspect = W0() / H0(); camera.updateProjectionMatrix(); ask(); }) : null;
    if (ro) ro.observe(el);
    ask();

    return {
      select(m) { selected = m || ""; ask(); },
      turn(rad) { yaw += rad; ask(); },
      get selected() { return selected; },
      destroy() {
        alive = false;
        if (raf) root.cancelAnimationFrame(raf);
        if (ro) ro.disconnect();
        disposables.forEach(d => d.dispose && d.dispose());
        renderer.dispose();
        if (renderer.forceContextLoss) renderer.forceContextLoss();
        canvas.remove(); tag.remove(); hint.remove();
      },
    };
  }

  const api = { SRC, PARTS, MUSCLES, muscles, hasWebGL, load, mount };
  root.Body3D = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
