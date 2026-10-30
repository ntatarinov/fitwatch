// Древовидный диалог тренера: следующий вопрос зависит от пройденного пути,
// варианты ответа можно скрывать по состоянию пользователя (when), а тексты — подстраивать (функции).
// Чистая логика, без страницы. Подход тот же, что у чата Соратника в Solution Advisor
// (собранные ответы → следующий шаг → вводная фраза по предыдущему выбору).
(function (root) {
  "use strict";

  const val = (v, collected, ctx) => (typeof v === "function" ? v(collected, ctx) : v);

  // path: [{node, option}] — пройденные шаги. Возвращает {nodeId: optionId}.
  function collected(path) {
    const c = {};
    path.forEach(s => { c[s.node] = s.option; });
    return c;
  }

  function visibleOptions(node, ctx, coll) {
    return (node.options || []).filter(o => !o.when || o.when(ctx, coll));
  }

  // Текущий узел после прохождения пути; null — путь некорректен.
  function current(tree, path) {
    let id = tree.start;
    const coll = {};
    for (const step of path) {
      const node = tree.nodes[id];
      if (!node || step.node !== id) return null;
      const opt = (node.options || []).find(o => o.id === step.option);
      if (!opt) return null;
      coll[id] = opt.id;
      id = opt.next;
      if (!id) return null;
    }
    const node = tree.nodes[id];
    return node ? { id, node, collected: coll } : null;
  }

  // Выбор ответа: возвращает новый путь или null, если вариант недоступен.
  function choose(tree, path, optionId, ctx) {
    const cur = current(tree, path);
    if (!cur || cur.node.leaf) return null;
    const opt = visibleOptions(cur.node, ctx, cur.collected).find(o => o.id === optionId);
    if (!opt || !tree.nodes[opt.next]) return null;
    return path.concat([{ node: cur.id, option: opt.id }]);
  }

  const back = path => path.slice(0, -1);

  // Переписка для показа: вопрос бота → ответ пользователя → реплика бота.
  function transcript(tree, path, ctx) {
    const msgs = [];
    let id = tree.start;
    const coll = {};
    for (const step of path) {
      const node = tree.nodes[id];
      const opt = node.options.find(o => o.id === step.option);
      msgs.push({ me: false, text: val(node.ask, coll, ctx) });
      msgs.push({ me: true, text: opt.label });
      coll[id] = opt.id;
      const ack = val(opt.ack, coll, ctx);
      if (ack) msgs.push({ me: false, text: ack });
      id = opt.next;
    }
    return msgs;
  }

  // Что показать сейчас: вопрос с вариантами или итог (лист).
  function view(tree, path, ctx) {
    const cur = current(tree, path);
    if (!cur) return null;
    const { node, collected: coll } = cur;
    if (node.leaf) {
      return { leaf: true, id: cur.id, title: val(node.title, coll, ctx), text: val(node.text, coll, ctx), tips: val(node.tips, coll, ctx) || [], action: node.action || null };
    }
    return { leaf: false, id: cur.id, ask: val(node.ask, coll, ctx), options: visibleOptions(node, ctx, coll).map(o => ({ id: o.id, label: o.label })) };
  }

  // Проверка целостности дерева: все ссылки ведут к существующим узлам, у каждого вопроса есть варианты,
  // все узлы достижимы, нет циклов.
  function validate(tree) {
    const errs = [];
    const ids = Object.keys(tree.nodes);
    if (!tree.nodes[tree.start]) errs.push("нет стартового узла " + tree.start);
    const reach = new Set();
    (function walk(id, stack) {
      if (stack.includes(id)) { errs.push("цикл: " + stack.concat(id).join(" → ")); return; }
      reach.add(id);
      const n = tree.nodes[id];
      if (!n) return;
      if (n.leaf) return;
      if (!n.options || !n.options.length) errs.push("у вопроса " + id + " нет вариантов");
      (n.options || []).forEach(o => {
        if (!o.next || !tree.nodes[o.next]) errs.push("вариант " + id + "/" + o.id + " ведёт в несуществующий узел " + o.next);
        else walk(o.next, stack.concat(id));
      });
    })(tree.start, []);
    ids.filter(i => !reach.has(i)).forEach(i => errs.push("недостижимый узел " + i));
    return errs;
  }

  const api = { collected, visibleOptions, current, choose, back, transcript, view, validate };
  root.Tree = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
