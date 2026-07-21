-- malem Version 7 — D1 schema for accounts, sessions, and synced user state.
-- Apply with:  wrangler d1 execute malem-db --file=./schema.sql

PRAGMA foreign_keys = ON;

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
  token_hash TEXT PRIMARY KEY,          -- SHA-256 of the random cookie token
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL           -- epoch ms
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS user_state (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state_json TEXT NOT NULL,             -- validated Version 1 customer state
  public_json TEXT NOT NULL DEFAULT '[]', -- bounded projection for community reads
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_state_updated ON user_state(updated_at);
