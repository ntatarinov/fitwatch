// Общие помощники для проверки сервера на настоящей базе Postgres в памяти (PGlite).
const path = require("path");
const { handle } = require(path.join(__dirname, "..", "api", "_lib", "app.js"));
const { migrate } = require(path.join(__dirname, "..", "api", "_lib", "db.js"));

async function makeDb() {
  let PGlite;
  try { ({ PGlite } = await import("@electric-sql/pglite")); } catch (e) { return null; }
  const pg = new PGlite();
  const db = { query: async (t, p) => (await pg.query(t, p || [])).rows, close: () => pg.close() };
  await migrate(db);
  return db;
}

// Клиент с «браузерным» хранилищем cookie. now — виртуальное время сервера.
function client(db, start) {
  let cookie = "", ip = "1.1.1.1", now = start ? new Date(start) : new Date("2026-11-02T10:00:00Z");
  const c = {
    setNow: v => { now = new Date(v); },
    setIp: v => { ip = v; },
    cookie: () => cookie,
    async call(method, p, body, extra) {
      const headers = Object.assign({ host: "fitwatch.test", "x-forwarded-for": ip }, extra || {});
      if (method !== "GET") headers["x-fw"] = headers["x-fw"] === null ? undefined : "1";
      if (cookie) headers.cookie = cookie;
      let q = {}; const [pathOnly, qs] = p.split("?");
      if (qs) qs.split("&").forEach(kv => { const [k, v] = kv.split("="); q[k] = v; });
      const res = await handle({ method, path: pathOnly, query: q, body, headers }, { db, now });
      (res.cookies || []).forEach(sc => { const kv = sc.split(";")[0]; const [k, v] = kv.split("="); cookie = v === "" ? "" : k + "=" + v; });
      return res;
    },
  };
  return c;
}
async function newUser(db, n, opts) {
  const c = client(db, opts && opts.now);
  c.setIp("10.1." + (n >> 8) + "." + (n & 255)); // у каждого игрока свой адрес, чтобы не срабатывало ограничение регистраций
  const r = await c.call("POST", "/api/auth/register", { email: "u" + n + "@test.kz", password: "password" + n, name: "Игрок" + n });
  if (r.status !== 201) throw new Error("register failed " + JSON.stringify(r.body));
  return c;
}
module.exports = { makeDb, client, newUser, handle };
