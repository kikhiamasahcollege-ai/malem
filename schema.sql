-- malem — D1 schema for real accounts + sessions.
-- Apply with:  wrangler d1 execute malem-db --file=./schema.sql

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,          -- uuid
  email      TEXT UNIQUE NOT NULL,      -- lowercased
  name       TEXT,
  provider   TEXT NOT NULL,             -- 'password' (extra providers can be added later)
  pw_hash    TEXT,                      -- PBKDF2-SHA256 hex
  pw_salt    TEXT,                      -- per-user random salt (hex)
  created_at INTEGER NOT NULL           -- epoch ms
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,          -- random; stored in an httpOnly cookie
  user_id    TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL           -- epoch ms
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
