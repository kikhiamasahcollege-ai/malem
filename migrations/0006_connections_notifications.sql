PRAGMA foreign_keys = ON;

CREATE TABLE user_connections (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL,
  provider_account_id   TEXT NOT NULL DEFAULT '',
  scopes_json           TEXT NOT NULL DEFAULT '[]',
  encrypted_tokens_json TEXT NOT NULL,
  expires_at            INTEGER,
  revoked_at            INTEGER,
  last_error            TEXT NOT NULL DEFAULT '',
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  UNIQUE (user_id, provider, provider_account_id)
);
CREATE INDEX idx_user_connections_user
  ON user_connections(user_id, provider, updated_at DESC);

CREATE TABLE calendar_preferences (
  connection_id       TEXT PRIMARY KEY REFERENCES user_connections(id) ON DELETE CASCADE,
  calendar_id_ciphertext TEXT,
  availability_enabled INTEGER NOT NULL DEFAULT 0 CHECK (availability_enabled IN (0, 1)),
  sync_mode           TEXT NOT NULL DEFAULT 'selected'
    CHECK (sync_mode IN ('selected', 'bookings', 'assignments', 'full_schedule')),
  timezone            TEXT NOT NULL DEFAULT 'UTC',
  updated_at          INTEGER NOT NULL
);

CREATE TABLE external_event_links (
  id                 TEXT PRIMARY KEY,
  trip_id            TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id      TEXT NOT NULL REFERENCES user_connections(id) ON DELETE CASCADE,
  source_type        TEXT NOT NULL,
  source_id          TEXT NOT NULL,
  provider_event_id  TEXT NOT NULL,
  provider_etag      TEXT,
  sync_state         TEXT NOT NULL DEFAULT 'synced'
    CHECK (sync_state IN ('pending', 'synced', 'conflict', 'deleted', 'error')),
  last_error         TEXT NOT NULL DEFAULT '',
  last_synced_at     INTEGER,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  UNIQUE (connection_id, source_type, source_id),
  UNIQUE (connection_id, provider_event_id)
);
CREATE INDEX idx_external_event_links_plan
  ON external_event_links(trip_id, sync_state, updated_at DESC);

CREATE TABLE notification_rules (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trip_id        TEXT REFERENCES trips(id) ON DELETE CASCADE,
  source_type    TEXT NOT NULL,
  source_id      TEXT,
  channel        TEXT NOT NULL CHECK (channel IN ('in_app', 'calendar', 'email', 'push')),
  offset_minutes INTEGER NOT NULL,
  enabled        INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX idx_notification_rules_user
  ON notification_rules(user_id, trip_id, enabled);

CREATE TABLE notification_outbox (
  id             TEXT PRIMARY KEY,
  rule_id        TEXT REFERENCES notification_rules(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trip_id        TEXT REFERENCES trips(id) ON DELETE CASCADE,
  channel        TEXT NOT NULL,
  due_at         INTEGER NOT NULL,
  payload_json   TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempts       INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT UNIQUE NOT NULL,
  last_error     TEXT NOT NULL DEFAULT '',
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX idx_notification_outbox_due
  ON notification_outbox(status, due_at);
