// Доступ к базе. Рабочая база — Neon (Postgres) по строке подключения из окружения Vercel; тесты подставляют свою через setDb.
// Интерфейс один: db.query(text, params) → массив строк. Миграции применяются один раз при первом обращении.
const { MIGRATIONS } = require("./schema");

let current = null, ready = null;

function neonDb(url) {
  const { neon } = require("@neondatabase/serverless");
  const sql = neon(url);
  return { query: (text, params) => sql.query(text, params || []) };
}

async function migrate(db) {
  await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (version int PRIMARY KEY, name text, applied_at timestamptz NOT NULL DEFAULT now())");
  const done = new Set((await db.query("SELECT version FROM schema_migrations")).map(r => r.version));
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    for (const stmt of m.sql) await db.query(stmt);
    await db.query("INSERT INTO schema_migrations(version, name) VALUES ($1, $2) ON CONFLICT DO NOTHING", [m.version, m.name]);
  }
}

function setDb(db) { current = db; ready = null; }

async function getDb() {
  if (!current) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) { const e = new Error("База данных не подключена"); e.code = "NO_DB"; throw e; }
    current = neonDb(url);
  }
  if (!ready) ready = migrate(current).catch(e => { ready = null; throw e; });
  await ready;
  return current;
}

module.exports = { getDb, setDb, migrate, MIGRATIONS };
