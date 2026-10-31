// 3D-анатомия: настоящая модель мышц и костей человека (BodyParts3D, © The Database Center for Life Science, CC BY 4.0),
// собранная в models/anatomy.glb скриптом scripts/build-anatomy.mjs. 14 групп мышц выбираются нажатием, модель крутится
// пальцем или мышью и приближается двумя пальцами или колёсиком; при выборе камера подлетает к мышце.
// Three.js, загрузчик и распаковщик сжатия грузятся только при открытии 3D; без WebGL или без сети — честный отказ.
(function (root) {
  "use strict";
  const LIBS = [
    "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
    "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js",
    "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/meshopt_decoder.js",
  ];
  const SRC = LIBS[0], MODEL = "/models/anatomy.glb";
  const CREDIT = "3D-модель: BodyParts3D, © The Database Center for Life Science, CC BY 4.0";
  const CREDIT_URL = "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html";
  // Группы мышц модели (узлы m_<id>), id как в каталоге.
  const MUSCLES = ["neck", "traps", "shoulders", "chest", "biceps", "triceps", "abs", "obliques", "lats", "lower_back", "glutes", "quads", "hamstrings", "calves"];
  const muscles = () => MUSCLES.slice();
  // Мышцы, которые видны сзади: при выборе из списка модель поворачивается к ним спиной.
  // Мышцы, видимые только с одной стороны: с другой они лежат за телом и нажатием не выбираются.
  const FRONT_ONLY = ["chest", "abs", "biceps", "quads"], BACK_ONLY = ["traps", "triceps", "lats", "lower_back", "glutes", "hamstrings"];
  const BACK = ["traps", "triceps", "lats", "lower_back", "glutes", "hamstrings", "calves"];

  // Выбор мышцы из попаданий луча (по возрастанию расстояния): hits — [{ m, distance }], side — 1 грудью к камере, -1 спиной, 0 боком,
  // depth — на сколько глубже первого допустимого попадания ещё смотрим, score(hit) — чем меньше, тем лучше (расстояние до центра мышцы).
  function choose(hits, side, depth, score) {
    let first = -1, best = "", bestScore = Infinity;
    for (let i = 0; i < hits.length; i++) {
      const m = hits[i].m;
      if ((side > 0 && BACK_ONLY.includes(m)) || (side < 0 && FRONT_ONLY.includes(m))) continue;
      if (first < 0) first = hits[i].distance;
      if (hits[i].distance - first > depth) break;
      const sc = score(hits[i]);
      if (sc < bestScore) { bestScore = sc; best = m; }
    }
    return best;
  }
  // Модель сжата в целые числа (KHR_mesh_quantization), а луч нажатия в three r128 читает их «как есть»: попадания были случайными.
  // Положения вершин переводятся в обычные дробные числа; узел модели сам возвращает масштаб.
  function dequantize(THREE, geometry) {
    const pos = geometry.attributes.position;
    if (!pos || pos.array instanceof Float32Array) return;
    const k = pos.normalized ? (pos.array instanceof Int16Array ? 32767 : pos.array instanceof Int8Array ? 127 : pos.array instanceof Uint16Array ? 65535 : 255) : 1;
    const f = new Float32Array(pos.array.length);
    for (let i = 0; i < f.length; i++) f[i] = Math.max(-1, pos.array[i] / k);
    geometry.setAttribute("position", new THREE.BufferAttribute(f, 3));
    geometry.computeBoundingSphere(); geometry.computeBoundingBox();
  }

  function hasWebGL() {
    try {
      const c = root.document.createElement("canvas");
      return !!(root.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (e) { return false; }
  }
  const script = src => new Promise((ok, fail) => {
    const s = root.document.createElement("script");
    s.src = src; s.async = false; s.crossOrigin = "anonymous";
    s.onload = ok; s.onerror = () => { s.remove(); fail(new Error("load " + src)); };
    root.document.head.appendChild(s);
  });
  let loading = null;
  function load() {
    if (root.THREE && root.THREE.GLTFLoader && root.MeshoptDecoder) return Promise.resolve(root.THREE);
    if (loading) return loading;
    loading = LIBS.reduce((p, src, i) => p.then(() => (i === 0 && root.THREE) || (i === 1 && root.THREE && root.THREE.GLTFLoader) || (i === 2 && root.MeshoptDecoder) ? null : script(src)), Promise.resolve())
      .then(() => root.THREE).catch(e => { loading = null; throw e; });
    return loading;
  }
  const cssColor = (name, fallback) => {
    try { const v = root.getComputedStyle(root.document.documentElement).getPropertyValue(name).trim(); return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback; } catch (e) { return fallback; }
  };

  // el — контейнер; opts: { selected, labels: {id: название}, onPick(id), onProgress(доля) }. Возвращает Promise<{ select, reset, destroy }>.
  async function mount(el, opts) {
    const o = opts || {};
    if (!hasWebGL()) throw new Error("webgl");
    const THREE = await load();
    if (!el.isConnected) throw new Error("gone");
    const gltf = await new Promise((ok, fail) => {
      const loader = new THREE.GLTFLoader();
      loader.setMeshoptDecoder(root.MeshoptDecoder);
      loader.load(MODEL, ok, ev => { if (o.onProgress && ev.total) o.onProgress(ev.loaded / ev.total); }, fail);
    });
    if (!el.isConnected) throw new Error("gone");
    const names = o.labels || {};
    const HL = new THREE.Color(cssColor("--accent-2", "#FF6A2B")), HOVER = new THREE.Color("#E07A5F");

    const W0 = () => Math.max(240, el.clientWidth || 320), H0 = () => Math.round(Math.min(560, W0() * 1.35));
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, root.devicePixelRatio || 1));
    renderer.setSize(W0(), H0());
    const canvas = renderer.domElement;
    canvas.className = "b3d-canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "3D-модель мышц человека: крути пальцем, приближай двумя пальцами, нажми на мышцу");
    const tag = root.document.createElement("div"); tag.className = "b3d-tag"; tag.hidden = true;
    const hint = root.document.createElement("div"); hint.className = "b3d-hint"; hint.textContent = "Крути пальцем, приближай двумя пальцами, нажми на мышцу";
    const all = root.document.createElement("button"); all.type = "button"; all.className = "b3d-all ghost tiny-btn"; all.textContent = "Всё тело"; all.hidden = true;
    const credit = root.document.createElement("a"); credit.className = "b3d-credit"; credit.href = CREDIT_URL; credit.target = "_blank"; credit.rel = "noopener"; credit.textContent = CREDIT;
    el.innerHTML = ""; [canvas, tag, hint, all, credit].forEach(n => el.appendChild(n));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, W0() / H0(), 0.05, 20);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x6b5a50, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(1.2, 2.2, 2.5); scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.45); rim.position.set(-1.5, 1.6, -2.5); scene.add(rim);

    const figure = new THREE.Group(); figure.add(gltf.scene); scene.add(figure);
    // Материалы: у каждой выбираемой группы свой (подсветка не задевает соседей); у всех двусторонняя отрисовка.
    const groups = {}, meshes = [], disposables = [];
    gltf.scene.traverse(n => {
      if (!n.isMesh) return;
      n.material = n.material.clone(); n.material.side = THREE.DoubleSide;
      dequantize(THREE, n.geometry);
      disposables.push(n.material, n.geometry);
      const m = /^m_(.+)$/.exec(n.name);
      if (m && MUSCLES.includes(m[1])) { groups[m[1]] = { mesh: n, base: n.material.color.clone() }; n.userData.m = m[1]; meshes.push(n); }
    });
    const box = new THREE.Box3().setFromObject(gltf.scene), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const home = { target: center.clone(), dist: size.y * 2.05 };
    const view = { target: home.target.clone(), dist: home.dist };
    let anim = null;

    let selected = o.selected || "", hovered = "", yaw = 0, pitch = 0, raf = 0, alive = true;
    const paint = () => Object.keys(groups).forEach(id => {
      const g = groups[id], mat = g.mesh.material;
      if (id === selected) { mat.color.copy(HL); mat.emissive.setRGB(0.25, 0.08, 0); }
      else if (id === hovered) { mat.color.copy(HOVER); mat.emissive.setRGB(0.05, 0.02, 0); }
      else { mat.color.copy(g.base); mat.emissive.setRGB(0, 0, 0); }
    });
    const centerOf = id => { const b = new THREE.Box3().setFromObject(groups[id].mesh); return b.getCenter(new THREE.Vector3()); };
    // Подпись над выбранной мышцей: проекция её центра на экран.
    function placeTag() {
      if (!selected || !groups[selected]) { tag.hidden = true; return; }
      const c = centerOf(selected).project(camera);
      if (c.z > 1) { tag.hidden = true; return; }
      tag.textContent = names[selected] || selected;
      tag.style.left = ((c.x + 1) / 2 * W0()) + "px";
      tag.style.top = ((1 - c.y) / 2 * H0()) + "px";
      tag.hidden = false;
    }
    function render() {
      raf = 0; if (!alive) return;
      if (anim) {
        const k = Math.min(1, (Date.now() - anim.t0) / 450), e = 1 - Math.pow(1 - k, 3);
        view.target.lerpVectors(anim.from.target, anim.to.target, e); view.dist = anim.from.dist + (anim.to.dist - anim.from.dist) * e;
        if (anim.to.yaw !== undefined) yaw = anim.from.yaw + (anim.to.yaw - anim.from.yaw) * e;
        if (k < 1) ask(); else anim = null;
      }
      figure.rotation.set(pitch, yaw, 0);
      camera.position.set(view.target.x, view.target.y, view.target.z + view.dist); camera.lookAt(view.target);
      paint(); renderer.render(scene, camera); placeTag();
    }
    function ask() { if (!raf && alive) raf = root.requestAnimationFrame(render); }
    const flyTo = to => { anim = { t0: Date.now(), from: { target: view.target.clone(), dist: view.dist, yaw }, to }; ask(); };
    // Подлёт к мышце: учитываем текущий поворот фигуры, чтобы мышца оказалась в центре кадра.
    function focus(id, turn) {
      if (!id || !groups[id]) { flyTo({ target: home.target.clone(), dist: home.dist }); all.hidden = true; return; }
      // Поворот нужной стороной (ближайший оборот), если мышцу выбрали из списка, а не нажатием на модель.
      let toYaw;
      if (turn) { const want = BACK.includes(id) ? Math.PI : 0; toYaw = want + Math.round((yaw - want) / (2 * Math.PI)) * 2 * Math.PI; pitch = 0; }
      figure.rotation.set(pitch, toYaw === undefined ? yaw : toYaw, 0); figure.updateMatrixWorld(true);
      const c = centerOf(id), b = new THREE.Box3().setFromObject(groups[id].mesh).getSize(new THREE.Vector3());
      flyTo({ target: c, dist: Math.max(0.55, Math.min(home.dist, Math.max(b.x, b.y) * 3.2)), yaw: toYaw });
      all.hidden = false;
    }

    // Управление: тянем — поворот и наклон, два пальца или колесо — приближение, короткое нажатие — выбор мышцы.
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    // Что нажато. Слои мышц в модели лежат вплотную, поэтому «ближайшая поверхность» выбирала случайную мышцу, а луч через тело
    // доставал мышцы с другой стороны. Правила: со стороны груди не выбираются мышцы спины и наоборот (как в «Спереди / Сзади»);
    // из мышц, лежащих у поверхности на одной глубине, берётся та, чей центр ближе к точке нажатия.
    const centers = {};
    meshes.forEach(m => { centers[m.userData.m] = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()); });
    const point = new THREE.Vector3(), depth = size.y * 0.035;
    const hit = ev => {
      const r = canvas.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      camera.updateMatrixWorld(true); figure.updateMatrixWorld(true);
      ray.setFromCamera(ndc, camera);
      const side = Math.cos(yaw) > 0.35 ? 1 : Math.cos(yaw) < -0.35 ? -1 : 0;
      const hs = ray.intersectObjects(meshes, false).map(h => ({ m: h.object.userData.m, distance: h.distance, point: h.point }));
      return choose(hs, side, depth, h => figure.worldToLocal(point.copy(h.point)).distanceTo(centers[h.m]));
    };

    const pts = new Map();
    let down = null, pinch = null;
    const zoom = f => { view.dist = Math.max(0.45, Math.min(home.dist * 1.2, view.dist * f)); anim = null; all.hidden = view.dist > home.dist * 0.95; ask(); };
    canvas.addEventListener("pointerdown", ev => {
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: view.dist }; down = null; return; }
      down = { x: ev.clientX, y: ev.clientY, yaw, pitch, moved: false };
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* не везде */ }
      hint.hidden = true;
    });
    canvas.addEventListener("pointermove", ev => {
      if (pts.has(ev.pointerId)) pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pinch && pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); view.dist = pinch.dist; zoom(pinch.d / Math.max(20, d)); return; }
      if (down) {
        const dx = ev.clientX - down.x, dy = ev.clientY - down.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) down.moved = true;
        yaw = down.yaw + dx * 0.012; pitch = Math.max(-0.5, Math.min(0.5, down.pitch + dy * 0.005));
        ask(); return;
      }
      if (ev.pointerType === "mouse") { const m = hit(ev); if (m !== hovered) { hovered = m; canvas.style.cursor = m ? "pointer" : "grab"; ask(); } }
    });
    const end = ev => {
      const was = pts.has(ev.pointerId); pts.delete(ev.pointerId);
      if (pts.size < 2) pinch = null;
      if (ev.type === "pointerup" && was && down && !down.moved) {
        const m = hit(ev);
        if (m) { selected = selected === m ? "" : m; focus(selected); ask(); if (o.onPick) o.onPick(selected); }
      }
      down = null;
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("pointerleave", () => { if (hovered) { hovered = ""; ask(); } });
    canvas.addEventListener("wheel", ev => { ev.preventDefault(); zoom(ev.deltaY > 0 ? 1.1 : 0.9); }, { passive: false });
    all.addEventListener("click", () => focus(""));
    const ro = root.ResizeObserver ? new root.ResizeObserver(() => { renderer.setSize(W0(), H0()); camera.aspect = W0() / H0(); camera.updateProjectionMatrix(); ask(); }) : null;
    if (ro) ro.observe(el);
    if (selected) focus(selected, true); else ask();

    return {
      select(m) { if ((m || "") === selected) return; selected = m || ""; focus(selected, true); ask(); },
      reset() { focus(""); },
      get selected() { return selected; },
      pickAt: (x, y) => hit({ clientX: x, clientY: y }),
      destroy() {
        alive = false;
        if (raf) root.cancelAnimationFrame(raf);
        if (ro) ro.disconnect();
        disposables.forEach(d => d && d.dispose && d.dispose());
        renderer.dispose();
        if (renderer.forceContextLoss) renderer.forceContextLoss();
        el.innerHTML = "";
      },
    };
  }

  const api = { choose, dequantize, FRONT_ONLY, BACK_ONLY, LIBS, SRC, MODEL, CREDIT, CREDIT_URL, MUSCLES, muscles, hasWebGL, load, mount };
  root.Body3D = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
