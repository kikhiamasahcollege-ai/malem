PRAGMA foreign_keys = ON;

ALTER TABLE trips ADD COLUMN plan_type TEXT NOT NULL DEFAULT 'trip'
  CHECK (plan_type IN ('trip', 'event', 'blank'));
ALTER TABLE trips ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE trips ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE trips ADD COLUMN ai_mode TEXT NOT NULL DEFAULT 'guided'
  CHECK (ai_mode IN ('off', 'assist', 'guided'));
ALTER TABLE trips ADD COLUMN module_config_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE trips ADD COLUMN completed_at INTEGER;

-- V8 adds Participant: members who can vote, RSVP, complete assigned tasks,
-- manage their own packing, and add their own expenses without editing plan
-- content. The legacy collaborator role remains valid during migration and is
-- presented as Planner in the client.
CREATE TABLE trip_members_v3 (
  trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('owner', 'planner', 'collaborator', 'participant', 'viewer')),
  invited_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  joined_at   INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (trip_id, user_id)
);
INSERT INTO trip_members_v3
  (trip_id, user_id, role, invited_by, joined_at, updated_at)
SELECT trip_id, user_id, role, invited_by, joined_at, updated_at
  FROM trip_members;

DROP TABLE trip_members;
ALTER TABLE trip_members_v3 RENAME TO trip_members;
CREATE INDEX idx_trip_members_user ON trip_members(user_id, updated_at DESC);

CREATE TABLE plan_member_capabilities (
  trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability   TEXT NOT NULL,
  enabled      INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  updated_by   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (trip_id, user_id, capability)
);

CREATE TABLE plan_activity (
  id            TEXT PRIMARY KEY,
  trip_id       TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT,
  action        TEXT NOT NULL,
  summary       TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_plan_activity_trip ON plan_activity(trip_id, created_at DESC);

CREATE TABLE plan_tasks (
  id                 TEXT PRIMARY KEY,
  trip_id            TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title              TEXT NOT NULL,
  notes              TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  due_at              TEXT,
  timezone            TEXT NOT NULL DEFAULT 'UTC',
  visibility          TEXT NOT NULL DEFAULT 'shared'
    CHECK (visibility IN ('shared', 'private')),
  source_module       TEXT,
  source_entity_id    TEXT,
  created_by          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision            INTEGER NOT NULL DEFAULT 1,
  client_mutation_id  TEXT,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE INDEX idx_plan_tasks_trip ON plan_tasks(trip_id, status, due_at);
CREATE UNIQUE INDEX idx_plan_tasks_mutation
  ON plan_tasks(trip_id, client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;

CREATE TABLE plan_task_assignees (
  task_id     TEXT NOT NULL REFERENCES plan_tasks(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE plan_guests (
  id                  TEXT PRIMARY KEY,
  trip_id             TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  linked_user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  display_name        TEXT NOT NULL,
  email_ciphertext    TEXT,
  rsvp_status         TEXT NOT NULL DEFAULT 'invited'
    CHECK (rsvp_status IN ('invited', 'viewed', 'yes', 'no', 'maybe')),
  plus_one_count      INTEGER NOT NULL DEFAULT 0 CHECK (plus_one_count BETWEEN 0 AND 20),
  dietary_notes       TEXT NOT NULL DEFAULT '',
  accessibility_notes TEXT NOT NULL DEFAULT '',
  organizer_notes     TEXT NOT NULL DEFAULT '',
  revision            INTEGER NOT NULL DEFAULT 1,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE INDEX idx_plan_guests_trip ON plan_guests(trip_id, rsvp_status);

CREATE TABLE plan_rsvp_invites (
  id           TEXT PRIMARY KEY,
  token_hash   TEXT UNIQUE NOT NULL,
  trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  guest_id     TEXT REFERENCES plan_guests(id) ON DELETE CASCADE,
  invited_by   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at   INTEGER NOT NULL,
  max_uses     INTEGER NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 500),
  use_count    INTEGER NOT NULL DEFAULT 0,
  revoked_at   INTEGER,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX idx_plan_rsvp_invites_trip ON plan_rsvp_invites(trip_id, created_at DESC);

CREATE TABLE plan_date_polls (
  id          TEXT PRIMARY KEY,
  trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  timezone    TEXT NOT NULL DEFAULT 'UTC',
  deadline_at TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'closed')),
  locked_option_id TEXT,
  created_by  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision    INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_plan_date_polls_trip ON plan_date_polls(trip_id, status);

CREATE TABLE plan_date_options (
  id         TEXT PRIMARY KEY,
  poll_id    TEXT NOT NULL REFERENCES plan_date_polls(id) ON DELETE CASCADE,
  starts_at  TEXT NOT NULL,
  ends_at    TEXT NOT NULL,
  label      TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_plan_date_options_poll ON plan_date_options(poll_id, sort_order);

CREATE TABLE plan_date_votes (
  option_id   TEXT NOT NULL REFERENCES plan_date_options(id) ON DELETE CASCADE,
  actor_key   TEXT NOT NULL,
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  guest_id    TEXT REFERENCES plan_guests(id) ON DELETE CASCADE,
  value       TEXT NOT NULL CHECK (value IN ('preferred', 'available', 'maybe', 'unavailable')),
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (option_id, actor_key),
  CHECK (
    (user_id IS NOT NULL AND guest_id IS NULL)
    OR (user_id IS NULL AND guest_id IS NOT NULL)
  )
);
