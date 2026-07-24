PRAGMA foreign_keys = ON;

CREATE TABLE trip_invites_v3 (
  id           TEXT PRIMARY KEY,
  token_hash   TEXT UNIQUE NOT NULL,
  trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('planner', 'collaborator', 'participant', 'viewer')),
  invited_by   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at   INTEGER NOT NULL,
  max_uses     INTEGER NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 50),
  use_count    INTEGER NOT NULL DEFAULT 0,
  revoked_at   INTEGER,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER
);

INSERT INTO trip_invites_v3
  (id, token_hash, trip_id, role, invited_by, expires_at, max_uses, use_count,
   revoked_at, created_at, last_used_at)
SELECT id, token_hash, trip_id, role, invited_by, expires_at, max_uses, use_count,
       revoked_at, created_at, last_used_at
  FROM trip_invites;

DROP TABLE trip_invites;
ALTER TABLE trip_invites_v3 RENAME TO trip_invites;
CREATE INDEX idx_trip_invites_trip ON trip_invites(trip_id, created_at DESC);
CREATE INDEX idx_trip_invites_expiry ON trip_invites(expires_at);
