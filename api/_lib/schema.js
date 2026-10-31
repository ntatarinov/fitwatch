// Схема базы. Миграции применяются по порядку один раз; каждая — один или несколько SQL-запросов.
// Правило: старые миграции не правим, новые добавляем в конец (данные пользователей не теряются).
const MIGRATIONS = [
  {
    version: 1,
    name: "accounts, profiles, measurements, workouts",
    sql: [
      `CREATE TABLE IF NOT EXISTS users (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         email text NOT NULL UNIQUE,
         password_hash text NOT NULL,
         display_name text NOT NULL,
         role text NOT NULL DEFAULT 'client' CHECK (role IN ('client','trainer')),
         rating_opt_in boolean NOT NULL DEFAULT false,
         created_at timestamptz NOT NULL DEFAULT now()
       )`,
      `CREATE TABLE IF NOT EXISTS sessions (
         token_hash text PRIMARY KEY,
         user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         created_at timestamptz NOT NULL DEFAULT now(),
         expires_at timestamptz NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`,
      `CREATE TABLE IF NOT EXISTS login_attempts (key text NOT NULL, at timestamptz NOT NULL DEFAULT now())`,
      `CREATE INDEX IF NOT EXISTS login_attempts_key ON login_attempts(key, at)`,
      `CREATE TABLE IF NOT EXISTS profiles (
         user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
         goal text CHECK (goal IN ('lose','muscle','strength','endurance','health','flex')),
         level int CHECK (level BETWEEN 1 AND 3),
         days int CHECK (days BETWEEN 2 AND 6),
         minutes int CHECK (minutes IN (15,30,45,60)),
         place text CHECK (place IN ('home','dumbbells','gym')),
         limits text[] NOT NULL DEFAULT '{}',
         sex text CHECK (sex IN ('m','f')),
         age int CHECK (age BETWEEN 14 AND 90),
         height_cm numeric(5,1) CHECK (height_cm BETWEEN 120 AND 230),
         weight_kg numeric(5,1) CHECK (weight_kg BETWEEN 30 AND 300),
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
      `CREATE TABLE IF NOT EXISTS measurements (
         id bigserial PRIMARY KEY,
         user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         kind text NOT NULL CHECK (kind IN ('weight','height')),
         value numeric(6,1) NOT NULL,
         measured_on date NOT NULL,
         created_at timestamptz NOT NULL DEFAULT now(),
         UNIQUE (user_id, kind, measured_on)
       )`,
      `CREATE TABLE IF NOT EXISTS workouts (
         id bigserial PRIMARY KEY,
         user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         day date NOT NULL,
         program text NOT NULL,
         day_id text NOT NULL,
         title text,
         base_points int NOT NULL CHECK (base_points > 0),
         bonus_points int NOT NULL DEFAULT 0 CHECK (bonus_points >= 0),
         created_at timestamptz NOT NULL DEFAULT now(),
         UNIQUE (user_id, day)
       )`,
      `CREATE INDEX IF NOT EXISTS workouts_day ON workouts(day)`,
    ],
  },
];

module.exports = { MIGRATIONS };
