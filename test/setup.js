// Загружает данные и модули в память без браузера: тесты проверяют чистую логику.
const path = require("path");
global.window = global;
const root = path.join(__dirname, "..");
require(path.join(root, "data.js"));
const Catalog = require(path.join(root, "catalog.js"));
Catalog.resolve(window.PROGRAMS);
module.exports = {
  Catalog,
  Planner: require(path.join(root, "planner.js")),
  Nutrition: require(path.join(root, "nutrition.js")),
  Engine: require(path.join(root, "engine.js")),
  Tree: require(path.join(root, "tree.js")),
};
