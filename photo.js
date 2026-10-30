// Эксперимент: подсказка калорий по фото. Работает в браузере, без сервера и без платного API.
// Модель MobileNet (классы ImageNet) загружается с CDN один раз при первом использовании.
// Ограничения: узнаёт только общие продукты (банан, пицца, брокколи…), не знает плов, бешбармак, баурсаки;
// размер порции по фото не определяет — её выбирает пользователь.
(function (root) {
  "use strict";

  const LIBS = [
    "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js",
    "https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js",
  ];
  const MIN_PROB = 0.08; // ниже этого порога подсказку не показываем

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Не удалось загрузить " + src));
      document.head.appendChild(s);
    });
  }

  let modelPromise = null;
  function loadModel() {
    if (!modelPromise) {
      modelPromise = loadScript(LIBS[0]).then(() => loadScript(LIBS[1])).then(() => root.mobilenet.load({ version: 2, alpha: 1.0 }));
      modelPromise.catch(() => { modelPromise = null; }); // можно повторить после ошибки сети
    }
    return modelPromise;
  }

  // Чистая функция: связать ответы модели с известными продуктами.
  function matchFoods(preds, foods, minProb) {
    const min = minProb == null ? MIN_PROB : minProb;
    const out = [], seen = new Set();
    preds.forEach(p => {
      if (p.probability < min) return;
      const label = String(p.className).toLowerCase();
      foods.forEach(f => {
        if (seen.has(f.name)) return;
        if (f.keys.some(key => label.includes(key))) {
          seen.add(f.name);
          out.push({ food: f, prob: p.probability, label: p.className });
        }
      });
    });
    return out;
  }

  async function recognize(img) {
    const model = await loadModel();
    const preds = await model.classify(img, 5);
    return { preds, matches: matchFoods(preds, root.PHOTO_FOODS || []) };
  }

  const api = { MIN_PROB, loadModel, matchFoods, recognize };
  root.Photo = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
