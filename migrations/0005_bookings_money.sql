PRAGMA foreign_keys = ON;

CREATE TABLE plan_bookings (
  id                   TEXT PRIMARY KEY,
  trip_id              TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  booking_type         TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'idea'
    CHECK (status IN ('idea', 'shortlisted', 'needs_booking', 'booked', 'confirmed', 'completed', 'cancelled')),
  title                TEXT NOT NULL,
  provider             TEXT NOT NULL DEFAULT '',
  official_url         TEXT NOT NULL DEFAULT '',
  confirmation_ciphertext TEXT,
  travelers_json       TEXT NOT NULL DEFAULT '[]',
  starts_at            TEXT,
  ends_at              TEXT,
  timezone             TEXT NOT NULL DEFAULT 'UTC',
  location_json        TEXT NOT NULL DEFAULT '{}',
  amount_minor         INTEGER,
  currency             TEXT,
  cancellation_at      TEXT,
  cancellation_notes   TEXT NOT NULL DEFAULT '',
  check_action_url     TEXT NOT NULL DEFAULT '',
  check_deadline_at    TEXT,
  schedule_item_id     TEXT,
  source_url           TEXT NOT NULL DEFAULT '',
  checked_at           TEXT,
  assigned_user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  details_json         TEXT NOT NULL DEFAULT '{}',
  revision             INTEGER NOT NULL DEFAULT 1,
  client_mutation_id   TEXT,
  created_by           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);
CREATE INDEX idx_plan_bookings_plan
  ON plan_bookings(trip_id, status, starts_at);
CREATE UNIQUE INDEX idx_plan_bookings_mutation
  ON plan_bookings(trip_id, client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;

CREATE TABLE booking_assets (
  booking_id TEXT NOT NULL REFERENCES plan_bookings(id) ON DELETE CASCADE,
  asset_id   TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  label      TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (booking_id, asset_id)
);
CREATE TABLE plan_budgets (
  trip_id          TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  category         TEXT NOT NULL,
  amount_minor     INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency         TEXT NOT NULL,
  updated_by       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  updated_at       INTEGER NOT NULL,
  PRIMARY KEY (trip_id, category, currency)
);

CREATE TABLE plan_expenses (
  id                   TEXT PRIMARY KEY,
  trip_id              TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  description          TEXT NOT NULL,
  category             TEXT NOT NULL DEFAULT 'other',
  state                TEXT NOT NULL DEFAULT 'actual'
    CHECK (state IN ('estimated', 'committed', 'actual')),
  amount_minor         INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency             TEXT NOT NULL,
  reporting_amount_minor INTEGER,
  reporting_currency   TEXT,
  exchange_rate_text   TEXT,
  exchange_rate_source TEXT,
  exchange_rate_date   TEXT,
  payer_user_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  split_method         TEXT NOT NULL DEFAULT 'equal'
    CHECK (split_method IN ('equal', 'percentage', 'shares', 'exact')),
  visibility           TEXT NOT NULL DEFAULT 'shared'
    CHECK (visibility IN ('shared', 'private')),
  due_at               TEXT,
  receipt_asset_id     TEXT REFERENCES assets(id) ON DELETE SET NULL,
  revision             INTEGER NOT NULL DEFAULT 1,
  client_mutation_id   TEXT,
  created_by           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);
CREATE INDEX idx_plan_expenses_plan
  ON plan_expenses(trip_id, state, category, updated_at DESC);
CREATE UNIQUE INDEX idx_plan_expenses_mutation
  ON plan_expenses(trip_id, client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;

CREATE TABLE expense_splits (
  expense_id   TEXT NOT NULL REFERENCES plan_expenses(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  percentage_micros INTEGER,
  shares       INTEGER,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (expense_id, user_id)
);

CREATE TABLE plan_settlements (
  id                 TEXT PRIMARY KEY,
  trip_id            TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  from_user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_minor       INTEGER NOT NULL CHECK (amount_minor > 0),
  currency           TEXT NOT NULL,
  payment_provider   TEXT NOT NULL DEFAULT 'manual',
  payment_reference  TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'sender_confirmed', 'confirmed', 'disputed', 'cancelled')),
  revision           INTEGER NOT NULL DEFAULT 1,
  client_mutation_id TEXT,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  CHECK (from_user_id <> to_user_id)
);
CREATE INDEX idx_plan_settlements_plan
  ON plan_settlements(trip_id, status, updated_at DESC);

CREATE TABLE settlement_confirmations (
  settlement_id TEXT NOT NULL REFERENCES plan_settlements(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('sender', 'recipient')),
  confirmed_at  INTEGER NOT NULL,
  note          TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (settlement_id, user_id)
);
