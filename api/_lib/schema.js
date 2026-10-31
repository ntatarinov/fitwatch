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
  {
    version: 2,
    name: "trainers, links, messages, subscriptions, promo codes",
    sql: [
      `CREATE TABLE IF NOT EXISTS trainer_profiles (
         user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
         bio text NOT NULL CHECK (char_length(bio) BETWEEN 20 AND 1000),
         specialties text NOT NULL DEFAULT '' CHECK (char_length(specialties) <= 200),
         status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
         created_at timestamptz NOT NULL DEFAULT now(),
         decided_at timestamptz
       )`,
      `CREATE TABLE IF NOT EXISTS trainer_links (
         id bigserial PRIMARY KEY,
         client_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         trainer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','active','declined','ended')),
         share_goals boolean NOT NULL DEFAULT false,
         share_results boolean NOT NULL DEFAULT false,
         note text,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now(),
         CHECK (client_id <> trainer_id)
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS trainer_links_open ON trainer_links(client_id, trainer_id) WHERE status IN ('requested','active')`,
      `CREATE INDEX IF NOT EXISTS trainer_links_trainer ON trainer_links(trainer_id)`,
      `CREATE TABLE IF NOT EXISTS messages (
         id bigserial PRIMARY KEY,
         link_id bigint NOT NULL REFERENCES trainer_links(id) ON DELETE CASCADE,
         sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
         created_at timestamptz NOT NULL DEFAULT now()
       )`,
      `CREATE INDEX IF NOT EXISTS messages_link ON messages(link_id, id)`,
      `CREATE TABLE IF NOT EXISTS subscriptions (
         user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
         tier text NOT NULL CHECK (tier IN ('premium','personal')),
         until timestamptz NOT NULL,
         source text NOT NULL DEFAULT 'promo',
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
      `CREATE TABLE IF NOT EXISTS promo_codes (
         code text PRIMARY KEY CHECK (code ~ '^[A-Z0-9-]{4,24}$'),
         tier text NOT NULL CHECK (tier IN ('premium','personal')),
         days int NOT NULL CHECK (days BETWEEN 1 AND 366),
         max_uses int NOT NULL CHECK (max_uses BETWEEN 1 AND 1000),
         used int NOT NULL DEFAULT 0 CHECK (used >= 0),
         created_at timestamptz NOT NULL DEFAULT now()
       )`,
      `CREATE TABLE IF NOT EXISTS promo_redemptions (
         code text NOT NULL REFERENCES promo_codes(code) ON DELETE CASCADE,
         user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
         at timestamptz NOT NULL DEFAULT now(),
         PRIMARY KEY (code, user_id)
       )`,
    ],
  },
  {
    version: 3,
    name: "telegram login: email and password become optional",
    sql: [
      `ALTER TABLE users ALTER COLUMN email DROP NOT NULL`,
      `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_id bigint`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_username text`,
      `CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_id ON users(telegram_id) WHERE telegram_id IS NOT NULL`,
      `DO $$ BEGIN
         ALTER TABLE users ADD CONSTRAINT users_has_login CHECK (email IS NOT NULL OR telegram_id IS NOT NULL);
       EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    ],
  },
  {
    version: 4,
    name: "one-time nonces for Telegram login",
    sql: [
      `CREATE TABLE IF NOT EXISTS login_nonces (nonce text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now())`,
      `CREATE INDEX IF NOT EXISTS login_nonces_created ON login_nonces(created_at)`,
    ],
  },
  {
    version: 5,
    name: "private trainer note about a client",
    sql: [
      `ALTER TABLE trainer_links ADD COLUMN IF NOT EXISTS trainer_note text CHECK (trainer_note IS NULL OR char_length(trainer_note) <= 1000)`,
    ],
  },
  {
    version: 6,
    name: "browser history can be synced once per account",
    sql: [
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS history_synced_at timestamptz`,
    ],
  },
  {
    version: 7,
    name: "administrators appointed in the app",
    sql: [
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false`,
    ],
  },
];

module.exports = { MIGRATIONS };
