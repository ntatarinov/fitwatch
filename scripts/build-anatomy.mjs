// Сборка 3D-модели мышц для приложения из открытой модели BodyParts3D (© The Database Center for Life Science, CC BY 4.0).
// Исходники в проект не входят. Как пересобрать:
//   1) скачать в папку DATA: isa_BP3D_4.0_obj_99.zip, partof_BP3D_4.0_obj_99.zip (распаковать в DATA/obj),
//      isa_element_parts.txt, partof_element_parts.txt с https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
//   2) в отдельной папке: npm i @gltf-transform/core@4.1.1 @gltf-transform/functions@4.1.1 meshoptimizer@0.22.0
//   3) node scripts/build-anatomy.mjs DATA TOOLS_NODE_MODULES  → models/anatomy.glb
// Что внутри: 12 групп мышц из BodyParts3D, пресс и широчайшие (в BodyParts3D их нет) вылеплены по форме тела модели,
// остальные поверхностные мышцы и кости — фон без выбора.
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const DATA = process.argv[2], TOOLS = process.argv[3];
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "models", "anatomy.glb");
const req = createRequire(path.join(TOOLS, "x.js"));
const { Document, NodeIO } = req("@gltf-transform/core");
const { weld, normals, meshopt, dedup, prune } = req("@gltf-transform/functions");
const { ALL_EXTENSIONS } = req("@gltf-transform/extensions");
const { MeshoptSimplifier, MeshoptEncoder } = req("meshoptimizer");

// ---- справочник: название части → файлы деталей ----
const files = new Map();
for (const list of ["isa_element_parts.txt", "partof_element_parts.txt"]) {
  fs.readFileSync(path.join(DATA, list), "utf8").split("\n").slice(1).forEach(l => {
    const [, name, fj] = l.trim().split("\t");
    if (!name || !fj) return;
    if (!files.has(name)) files.set(name, new Set());
    files.get(name).add(fj);
  });
}
const dirs = ["isa_BP3D_4.0_obj_99", "partof_BP3D_4.0_obj_99"].map(d => path.join(DATA, "obj", d));
const objPath = fj => dirs.map(d => path.join(d, fj + ".obj")).find(p => fs.existsSync(p));
const both = names => names.flatMap(n => ["left " + n, "right " + n]);

// Группы мышц приложения (id как в каталоге) — части BodyParts3D.
const GROUPS = {
  chest: ["clavicular part of left pectoralis major", "clavicular part of right pectoralis major", "sternocostal part of left pectoralis major", "sternocostal part of right pectoralis major", "abdominal part of left pectoralis major", "abdominal part of right pectoralis major"],
  shoulders: ["clavicular part of left deltoid", "clavicular part of right deltoid", "acromial part of left deltoid", "acromial part of right deltoid", "spinal part of left deltoid", "spinal part of right deltoid"],
  biceps: ["long head of left biceps brachii", "long head of right biceps brachii", "short head of left biceps brachii", "short head of right biceps brachii"],
  triceps: ["long head of left triceps brachii", "long head of right triceps brachii", "lateral head of left triceps brachii", "lateral head of right triceps brachii", "medial head of left triceps brachii", "medial head of right triceps brachii"],
  obliques: both(["external oblique"]),
  traps: ["descending part of left trapezius", "descending part of right trapezius", "transverse part of left trapezius", "transverse part of right trapezius", "ascending part of left trapezius", "ascending part of right trapezius"],
  lower_back: ["iliocostalis", "longissimus"],
  glutes: both(["gluteus maximus", "gluteus medius"]),
  quads: both(["rectus femoris", "vastus lateralis", "vastus medialis"]),
  hamstrings: ["long head of left biceps femoris", "long head of right biceps femoris", "short head of left biceps femoris", "short head of right biceps femoris"].concat(both(["semitendinosus", "semimembranosus"])),
  calves: ["lateral head of left gastrocnemius", "lateral head of right gastrocnemius", "medial head of left gastrocnemius", "medial head of right gastrocnemius"].concat(both(["soleus"])),
  neck: both(["sternocleidomastoid"]),
};
// Фон: остальные поверхностные мышцы (цвет мышц, без выбора) и кости.
const BASE_MUSCLES = both(["serratus anterior", "infraspinatus muscle", "teres major", "brachioradialis", "flexor carpi radialis", "extensor carpi radialis longus", "extensor carpi radialis brevis", "extensor digitorum",
  "sartorius", "tensor fasciae latae", "gracilis", "adductor longus", "tibialis anterior", "fibularis longus", "fibularis brevis", "extensor digitorum longus", "levator scapulae", "rhomboid major"])
  .concat(["humeral head of left flexor carpi ulnaris", "humeral head of right flexor carpi ulnaris", "left extensor carpi ulnaris", "right extensor carpi ulnaris"]);
const BONES = ["skull", "vertebral column", "rib cage", "sternum", "pelvis"].concat(both(["clavicle", "scapula", "humerus", "radius", "ulna", "hand", "hip bone", "femur", "patella", "tibia", "fibula", "foot"]));

// ---- чтение OBJ: только вершины и треугольники; координаты BodyParts3D (мм, Z вверх, −Y вперёд) → метры, Y вверх, Z вперёд ----
function readObj(p, out) {
  const base = out.pos.length / 3;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    if (line.startsWith("v ")) { const [x, y, z] = line.slice(2).trim().split(/\s+/).map(Number); out.pos.push(x / 1000, z / 1000, -y / 1000); }
    else if (line.startsWith("f ")) {
      const v = line.slice(2).trim().split(/\s+/).map(s => parseInt(s.split("/")[0], 10) - 1);
      for (let i = 1; i + 1 < v.length; i++) out.idx.push(base + v[0], base + v[i], base + v[i + 1]);
    }
  }
}
function collect(names, label) {
  const out = { pos: [], idx: [] }, used = new Set(), missing = [];
  for (const n of names) {
    const fjs = files.get(n);
    if (!fjs) { missing.push(n); continue; }
    for (const fj of fjs) { if (used.has(fj)) continue; const p = objPath(fj); if (p) { used.add(fj); readObj(p, out); } }
  }
  if (missing.length) console.log("  нет в справочнике (" + label + "):", missing.join(", "));
  return out;
}
// Склейка совпадающих вершин (в исходниках детали состоят из несклеенных кусков): без неё упрощение почти ничего не убирает.
function weldMesh(mesh, eps) {
  const map = new Map(), pos = [], remap = new Uint32Array(mesh.pos.length / 3);
  for (let i = 0; i < remap.length; i++) {
    const k = Math.round(mesh.pos[i * 3] / eps) + "," + Math.round(mesh.pos[i * 3 + 1] / eps) + "," + Math.round(mesh.pos[i * 3 + 2] / eps);
    let j = map.get(k);
    if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(mesh.pos[i * 3], mesh.pos[i * 3 + 1], mesh.pos[i * 3 + 2]); }
    remap[i] = j;
  }
  const idx = [];
  for (let t = 0; t < mesh.idx.length; t += 3) {
    const a = remap[mesh.idx[t]], b = remap[mesh.idx[t + 1]], c = remap[mesh.idx[t + 2]];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  return { pos, idx };
}
async function simplify(mesh0, ratio, err) {
  await MeshoptSimplifier.ready;
  const mesh = weldMesh(mesh0, 0.0004);
  const idx = new Uint32Array(mesh.idx), pos = new Float32Array(mesh.pos);
  const target = Math.max(300, Math.floor(idx.length * ratio / 3) * 3);
  let [res] = MeshoptSimplifier.simplify(idx, pos, 3, target, err, []);
  if (res.length > target * 1.6) res = MeshoptSimplifier.simplifySloppy(idx, pos, 3, target, err * 2)[0] || res; // крупные упрямые детали
  return { pos: mesh.pos, idx: Array.from(res) };
}

export { readObj, collect, simplify, GROUPS, BASE_MUSCLES, BONES, files, DATA };

const main = async () => {
  const parts = {};
  for (const [g, names] of Object.entries(GROUPS)) { parts["m_" + g] = collect(names, g); }
  parts.base_muscle = collect(BASE_MUSCLES, "фон");
  parts.bone = collect(BONES, "кости");
  // Общая рамка: ставим ступни на y = 0 и центр по x/z.
  let minY = Infinity, sx = 0, sz = 0, n = 0;
  for (const m of Object.values(parts)) for (let i = 0; i < m.pos.length; i += 3) { minY = Math.min(minY, m.pos[i + 1]); sx += m.pos[i]; sz += m.pos[i + 2]; n++; }
  const cx = sx / n, cz = sz / n;
  for (const m of Object.values(parts)) for (let i = 0; i < m.pos.length; i += 3) { m.pos[i] -= cx; m.pos[i + 1] -= minY; m.pos[i + 2] -= cz; }
  fs.writeFileSync(path.join(DATA, "frame.json"), JSON.stringify({ cx, cz, minY }));
  const extra = await import(path.join(path.dirname(new URL(import.meta.url).pathname), "anatomy-sculpt.mjs"));
  Object.assign(parts, extra.sculpt(parts, { cx, cz, minY }));

  const doc = new Document(), buf = doc.createBuffer(), scene = doc.createScene("anatomy");
  doc.getRoot().getAsset().copyright = "BodyParts3D, © The Database Center for Life Science, CC BY 4.0 (https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html). Пресс и широчайшие вылеплены FitWatch.";
  const mat = (name, c, r) => doc.createMaterial(name).setBaseColorFactor(c).setRoughnessFactor(r).setMetallicFactor(0);
  const mMuscle = mat("muscle", [0.72, 0.29, 0.22, 1], 0.55), mBase = mat("muscle_base", [0.66, 0.31, 0.26, 1], 0.6), mBone = mat("bone", [0.9, 0.87, 0.8, 1], 0.7);
  let tris = 0;
  for (const [name, m0] of Object.entries(parts)) {
    if (!m0.idx.length) { console.log("  пусто:", name); continue; }
    const ratio = name === "bone" ? 0.035 : name === "base_muscle" ? 0.08 : name.startsWith("m_") && !m0.sculpted ? 0.12 : 1;
    const m = ratio < 1 ? await simplify(m0, ratio, name === "bone" ? 0.03 : 0.02) : m0;
    tris += m.idx.length / 3;
    const prim = doc.createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(m.pos)).setBuffer(buf))
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(m.idx)).setBuffer(buf))
      .setMaterial(name === "bone" ? mBone : name === "base_muscle" ? mBase : mMuscle);
    scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
    console.log("  " + name + ": " + (m.idx.length / 3) + " треугольников");
  }
  await MeshoptEncoder.ready;
  // Сжатие meshopt (EXT_meshopt_compression): Three.js распаковывает его своим декодером, файл в несколько раз меньше.
  await doc.transform(weld({ tolerance: 0.0005 }), normals({ overwrite: true }), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder }).write(OUT, doc);
  console.log("готово:", OUT, Math.round(fs.statSync(OUT).size / 1024) + " КБ,", tris, "треугольников");
};
if (process.argv[1] && process.argv[1].endsWith("build-anatomy.mjs")) main().catch(e => { console.error(e); process.exit(1); });
