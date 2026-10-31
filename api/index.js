// Единственная серверная функция проекта (на бесплатном тарифе их не больше 12): все адреса /api/* идут в handle().
const { handle } = require("./_lib/app");

module.exports = async (req, res) => {
  const out = await handle({
    method: req.method, path: (req.url || "/").split("?")[0], query: req.query || {}, body: req.body, headers: req.headers,
  });
  Object.keys(out.headers).forEach(k => res.setHeader(k, out.headers[k]));
  if (out.cookies.length) res.setHeader("Set-Cookie", out.cookies);
  res.status(out.status).json(out.body);
};
