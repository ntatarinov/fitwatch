// Питание: калории и БЖУ на 100 г, расчёт порции, итоги дня, ориентировочная цель.
// Значения ПРИБЛИЗИТЕЛЬНЫЕ (справочные таблицы), для учебного прототипа: перед использованием сверить с диетологом.
// Блюда казахской кухни особенно ориентировочные: состав зависит от рецепта.
(function (root) {
  "use strict";

  // f(id, название, ккал, белки, жиры, углеводы — на 100 г; порция по умолчанию в граммах; подпись порции)
  const f = (id, name, kcal, p, fat, c, g, label) => ({ id, name, kcal, p, f: fat, c, portion: { g, label: label || g + " г" } });
  const FOODS = [
    f("chicken_breast", "Куриная грудка варёная", 165, 31, 3.6, 0, 150),
    f("egg", "Яйцо куриное", 155, 13, 11, 1.1, 50, "1 шт (50 г)"),
    f("oatmeal", "Овсянка на воде", 71, 2.5, 1.5, 12, 250, "порция (250 г)"),
    f("buckwheat", "Гречка варёная", 110, 4, 1.1, 21, 150),
    f("rice", "Рис варёный", 130, 2.7, 0.3, 28, 150),
    f("pasta", "Макароны варёные", 150, 5, 0.9, 30, 180),
    f("potato", "Картофель варёный", 82, 2, 0.4, 17, 200),
    f("mashed", "Картофельное пюре", 95, 2, 3.5, 14, 200),
    f("bread", "Хлеб пшеничный", 250, 8, 3, 49, 30, "ломтик (30 г)"),
    f("cottage5", "Творог 5%", 121, 17, 5, 1.8, 150),
    f("kefir", "Кефир 1%", 40, 3, 1, 4, 250, "стакан (250 г)"),
    f("milk", "Молоко 2,5%", 52, 2.8, 2.5, 4.7, 250, "стакан (250 г)"),
    f("yogurt", "Йогурт натуральный", 60, 4, 3.2, 4.7, 200),
    f("cheese", "Сыр твёрдый", 360, 25, 28, 0, 30, "ломтик (30 г)"),
    f("beef", "Говядина варёная", 250, 25, 16, 0, 120),
    f("lamb", "Баранина варёная", 290, 25, 21, 0, 120),
    f("salmon", "Лосось запечённый", 200, 22, 12, 0, 150),
    f("cod", "Треска варёная", 82, 18, 0.7, 0, 150),
    f("banana", "Банан", 89, 1.1, 0.3, 22.8, 120, "1 шт (120 г)"),
    f("apple", "Яблоко", 52, 0.3, 0.2, 14, 180, "1 шт (180 г)"),
    f("orange", "Апельсин", 47, 0.9, 0.1, 12, 150, "1 шт (150 г)"),
    f("strawberry", "Клубника", 33, 0.7, 0.3, 7.7, 150),
    f("cucumber", "Огурец", 15, 0.7, 0.1, 3.6, 120, "1 шт (120 г)"),
    f("tomato", "Помидор", 18, 0.9, 0.2, 3.5, 120, "1 шт (120 г)"),
    f("broccoli", "Брокколи варёная", 35, 2.4, 0.4, 6.6, 150),
    f("carrot", "Морковь", 41, 0.9, 0.2, 10, 80, "1 шт (80 г)"),
    f("cabbage", "Капуста белокочанная", 25, 1.3, 0.1, 6, 150),
    f("salad", "Овощной салат с маслом", 70, 1.2, 5, 5.5, 200, "порция (200 г)"),
    f("sunflower_oil", "Масло подсолнечное", 884, 0, 100, 0, 10, "ложка (10 г)"),
    f("butter", "Масло сливочное", 717, 0.9, 81, 0.1, 10, "кусочек (10 г)"),
    f("sugar", "Сахар", 387, 0, 0, 100, 5, "ложка (5 г)"),
    f("honey", "Мёд", 304, 0.3, 0, 82, 20, "ложка (20 г)"),
    f("walnut", "Грецкие орехи", 654, 15, 65, 14, 30, "горсть (30 г)"),
    f("peanut", "Арахис", 567, 26, 49, 16, 30, "горсть (30 г)"),
    f("almond", "Миндаль", 579, 21, 50, 22, 30, "горсть (30 г)"),
    f("chocolate", "Шоколад молочный", 535, 7.7, 30, 59, 25, "долька (25 г)"),
    f("beans", "Фасоль варёная", 127, 8.7, 0.5, 23, 150),
    f("lentil", "Чечевица варёная", 116, 9, 0.4, 20, 150),
    f("avocado", "Авокадо", 160, 2, 14.7, 8.5, 100, "1/2 шт (100 г)"),
    f("plov", "Плов", 217, 7, 11, 22, 300, "порция (300 г)"),
    f("beshbarmak", "Бешбармак", 267, 13, 14, 22, 300, "порция (300 г)"),
    f("kuyrdak", "Куырдак", 220, 14, 16, 4, 250, "порция (250 г)"),
    f("manty", "Манты", 190, 9, 9, 18, 70, "1 шт (70 г)"),
    f("baursak", "Баурсак", 400, 7, 22, 44, 35, "1 шт (35 г)"),
    f("samsa", "Самса", 300, 9, 17, 28, 100, "1 шт (100 г)"),
    f("shorpa", "Шорпа", 53, 3.5, 3, 3, 300, "порция (300 г)"),
    f("kymyz", "Кымыз / шубат", 50, 2.5, 2.5, 4.5, 250, "стакан (250 г)"),
    f("tea_sugar", "Чай с сахаром", 10, 0, 0, 2.5, 200, "чашка (200 г)"),
    f("pizza", "Пицца", 266, 11, 10, 33, 220, "2 куска (220 г)"),
    f("cheeseburger", "Чизбургер", 295, 15, 14, 24, 150, "1 шт (150 г)"),
    f("hotdog", "Хот-дог", 290, 10, 17, 23, 100, "1 шт (100 г)"),
    f("ice_cream", "Мороженое", 200, 3.5, 11, 23, 100),
    f("soup", "Суп овощной / бульон", 40, 2, 1.5, 5, 300, "порция (300 г)"),
  ];

  // Ответ модели распознавания (ключ класса) → продукт из таблицы и масса порции. Остальное — только калории.
  const PHOTO_MAP = {
    "banana": { id: "banana", g: 120 }, "granny smith": { id: "apple", g: 180 }, "orange": { id: "orange", g: 150 },
    "strawberry": { id: "strawberry", g: 150 }, "broccoli": { id: "broccoli", g: 150 }, "cucumber": { id: "cucumber", g: 120 },
    "head cabbage": { id: "cabbage", g: 150 }, "pizza": { id: "pizza", g: 220 }, "cheeseburger": { id: "cheeseburger", g: 150 },
    "hotdog": { id: "hotdog", g: 100 }, "mashed potato": { id: "mashed", g: 200 }, "ice cream": { id: "ice_cream", g: 100 },
    "consomme": { id: "soup", g: 300 },
  };

  const byId = id => FOODS.find(x => x.id === id) || null;
  const norm = s => String(s).toLowerCase().replace(/ё/g, "е");
  const search = q => { const n = norm(q || "").trim(); return n ? FOODS.filter(x => norm(x.name).includes(n)) : FOODS.slice(); };
  const r1 = v => Math.round(v * 10) / 10;

  // Порция: граммы от 1 до 3000. Возвращает null при неверной массе.
  function calc(food, grams) {
    const g = Number(grams);
    if (!food || !(g >= 1 && g <= 3000)) return null;
    const k = g / 100;
    return { grams: Math.round(g), kcal: Math.round(food.kcal * k), p: r1(food.p * k), f: r1(food.f * k), c: r1(food.c * k) };
  }

  // Итоги по записям дня. Запись без БЖУ (старая или «своё» без БЖУ) считается только в калориях.
  function sum(entries) {
    const t = { kcal: 0, p: 0, f: 0, c: 0, withoutMacros: 0 };
    (entries || []).forEach(e => {
      t.kcal += e.kcal || 0;
      if (e.p == null) { t.withoutMacros++; return; }
      t.p += e.p; t.f += e.f; t.c += e.c;
    });
    return { kcal: Math.round(t.kcal), p: r1(t.p), f: r1(t.f), c: r1(t.c), withoutMacros: t.withoutMacros };
  }

  // Ориентир на день по формуле Миффлина — Сан Жеора. Это не диета и не медицинская рекомендация.
  function targets(me) {
    if (!me || !me.weight || !me.height || !me.age || !me.sex) return null;
    const w = Number(me.weight), h = Number(me.height), a = Number(me.age);
    if (!(w >= 30 && w <= 300 && h >= 120 && h <= 230 && a >= 14 && a <= 90)) return null;
    const bmr = 10 * w + 6.25 * h - 5 * a + (me.sex === "m" ? 5 : -161);
    const d = Number(me.days) || 0;
    const act = d <= 1 ? 1.2 : d <= 3 ? 1.375 : d <= 5 ? 1.55 : 1.725;
    let kcal = bmr * act;
    if (me.goal === "lose") kcal *= 0.85; else if (me.goal === "muscle") kcal *= 1.10;
    kcal = Math.max(me.sex === "m" ? 1500 : 1200, kcal);
    const pk = { lose: 1.8, muscle: 1.8, strength: 1.6, endurance: 1.4, health: 1.2, flex: 1.2 }[me.goal] || 1.2;
    const p = Math.round(w * pk), fat = Math.round(kcal * 0.25 / 9);
    const c = Math.max(0, Math.round((kcal - p * 4 - fat * 9) / 4));
    return { kcal: Math.round(kcal / 10) * 10, p, f: fat, c, bmr: Math.round(bmr) };
  }

  const api = { FOODS, PHOTO_MAP, byId, search, calc, sum, targets };
  root.Nutrition = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
