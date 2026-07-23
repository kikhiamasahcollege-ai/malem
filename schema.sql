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

-- Version 7 feature expansion: trips become independent collaboration
-- boundaries instead of living only inside one user's state_json document.
CREATE TABLE IF NOT EXISTS trips (
  id            TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  destination   TEXT NOT NULL,
  start_date    TEXT,
  end_date      TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trips_owner ON trips(owner_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS trip_documents (
  trip_id             TEXT PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
  document_json       TEXT NOT NULL,
  schema_version      INTEGER NOT NULL DEFAULT 2,
  revision            INTEGER NOT NULL DEFAULT 1,
  last_editor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trip_members (
  trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('owner', 'collaborator', 'viewer')),
  invited_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  joined_at   INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (trip_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_members_user ON trip_members(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS trip_invites (
  id           TEXT PRIMARY KEY,
  token_hash   TEXT UNIQUE NOT NULL,
  trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('collaborator', 'viewer')),
  invited_by   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at   INTEGER NOT NULL,
  max_uses     INTEGER NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 50),
  use_count    INTEGER NOT NULL DEFAULT 0,
  revoked_at   INTEGER,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_trip_invites_trip ON trip_invites(trip_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trip_invites_expiry ON trip_invites(expires_at);

CREATE TABLE IF NOT EXISTS trip_mutations (
  id                 TEXT PRIMARY KEY,
  trip_id            TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  actor_user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_mutation_id TEXT NOT NULL,
  base_revision      INTEGER NOT NULL,
  result_revision    INTEGER NOT NULL,
  operation_json     TEXT NOT NULL,
  before_json        TEXT,
  after_json         TEXT,
  created_at         INTEGER NOT NULL,
  UNIQUE (trip_id, client_mutation_id)
);

CREATE INDEX IF NOT EXISTS idx_trip_mutations_trip ON trip_mutations(trip_id, created_at DESC);

CREATE TABLE IF NOT EXISTS trip_vibe_votes (
  trip_id        TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  primary_vibe   TEXT NOT NULL,
  secondary_vibe TEXT,
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (trip_id, user_id)
);

CREATE TABLE IF NOT EXISTS itinerary_item_votes (
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  item_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value      INTEGER NOT NULL CHECK (value IN (-1, 0, 1)),
  note       TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (trip_id, item_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_itinerary_votes_trip ON itinerary_item_votes(trip_id, item_id);

CREATE TABLE IF NOT EXISTS place_cache (
  cache_key    TEXT PRIMARY KEY,
  provider     TEXT NOT NULL,
  result_json  TEXT NOT NULL,
  fetched_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  stale_until  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_place_cache_expiry ON place_cache(expires_at);

CREATE TABLE IF NOT EXISTS user_migrations (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  migrated_at INTEGER NOT NULL
);
