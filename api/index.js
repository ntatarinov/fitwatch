// Единственная серверная функция проекта (на бесплатном тарифе их не больше 12).
// vercel.json направляет все адреса /api/* сюда и передаёт остаток пути в параметре __p
// (файл с [...path] на Vercel ловит только адреса из одного сегмента). Дальше всё решает handle().
const { handle } = require("./_lib/app");

function pathOf(req) {
  const q = Object.assign({}, req.query || {});
  let p = q.__p;
  delete q.__p;
  if (Array.isArray(p)) p = p.join("/");
  if (typeof p !== "string") { // запрос пришёл без перенаправления: берём путь из адреса
    p = String(req.url || "/").split("?")[0].replace(/^\/api\/?/, "");
  }
  return { path: "/api/" + p.replace(/^\/+|\/+$/g, ""), query: q };
}

module.exports = async (req, res) => {
  const { path, query } = pathOf(req);
  const out = await handle({ method: req.method, path, query, body: req.body, headers: req.headers });
  Object.keys(out.headers).forEach(k => res.setHeader(k, out.headers[k]));
  if (out.cookies.length) res.setHeader("Set-Cookie", out.cookies);
  res.status(out.status).json(out.body);
};
module.exports.pathOf = pathOf;
