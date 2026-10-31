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
  const jar = {}; // как в браузере: несколько cookie, пустое значение или Max-Age=0 удаляет
  const cookie = () => Object.keys(jar).map(k => k + "=" + jar[k]).join("; ");
  let ip = "1.1.1.1", now = start ? new Date(start) : new Date("2026-11-02T10:00:00Z");
  const c = {
    setNow: v => { now = new Date(v); },
    setIp: v => { ip = v; },
    cookie,
    async call(method, p, body, extra) {
      const headers = Object.assign({ host: "fitwatch.test", "x-forwarded-for": ip }, extra || {});
      if (method !== "GET") headers["x-fw"] = headers["x-fw"] === null ? undefined : "1";
      if (cookie()) headers.cookie = cookie();
      let q = {}; const [pathOnly, qs] = p.split("?");
      if (qs) qs.split("&").forEach(kv => { const [k, v] = kv.split("="); q[k] = decodeURIComponent(v === undefined ? "" : v); }); // как Vercel: параметры раскодированы
      const res = await handle({ method, path: pathOnly, query: q, body, headers }, { db, now });
      (res.cookies || []).forEach(sc => { const kv = sc.split(";")[0], i = kv.indexOf("="), k = kv.slice(0, i), v = kv.slice(i + 1); if (v === "" || /Max-Age=0\b/.test(sc)) delete jar[k]; else jar[k] = v; });
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
// Администратор задаётся по ID аккаунта (ADMIN_USER_IDS): почта для этого не годится, её никто не подтверждает.
async function makeAdmin(db, email) {
  const r = await db.query("SELECT id FROM users WHERE email = $1", [email]);
  const ids = String(process.env.ADMIN_USER_IDS || "").split(",").filter(Boolean);
  if (!ids.includes(r[0].id)) ids.push(r[0].id);
  process.env.ADMIN_USER_IDS = ids.join(",");
  return r[0].id;
}
module.exports = { makeDb, client, newUser, handle, makeAdmin };
