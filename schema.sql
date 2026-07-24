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
  plan_type     TEXT NOT NULL DEFAULT 'trip'
    CHECK (plan_type IN ('trip', 'event', 'blank')),
  timezone      TEXT NOT NULL DEFAULT 'UTC',
  currency      TEXT NOT NULL DEFAULT 'USD',
  ai_mode       TEXT NOT NULL DEFAULT 'guided'
    CHECK (ai_mode IN ('off', 'assist', 'guided')),
  module_config_json TEXT NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  completed_at  INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trips_owner ON trips(owner_user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS trip_documents (
  trip_id             TEXT PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
  document_json       TEXT NOT NULL,
  schema_version      INTEGER NOT NULL DEFAULT 3,
  revision            INTEGER NOT NULL DEFAULT 1,
  last_editor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trip_members (
  trip_id     TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('owner', 'planner', 'collaborator', 'participant', 'viewer')),
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
  role         TEXT NOT NULL CHECK (role IN ('planner', 'collaborator', 'participant', 'viewer')),
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

CREATE TABLE IF NOT EXISTS plan_member_capabilities (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (trip_id, user_id, capability)
);

CREATE TABLE IF NOT EXISTS plan_activity (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plan_activity_trip ON plan_activity(trip_id, created_at DESC);

CREATE TABLE IF NOT EXISTS plan_tasks (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  due_at TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  visibility TEXT NOT NULL DEFAULT 'shared' CHECK (visibility IN ('shared', 'private')),
  source_module TEXT,
  source_entity_id TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 1,
  client_mutation_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plan_tasks_trip ON plan_tasks(trip_id, status, due_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_tasks_mutation
  ON plan_tasks(trip_id, client_mutation_id) WHERE client_mutation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS plan_task_assignees (
  task_id TEXT NOT NULL REFERENCES plan_tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE IF NOT EXISTS plan_guests (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  linked_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  email_ciphertext TEXT,
  rsvp_status TEXT NOT NULL DEFAULT 'invited'
    CHECK (rsvp_status IN ('invited', 'viewed', 'yes', 'no', 'maybe')),
  plus_one_count INTEGER NOT NULL DEFAULT 0 CHECK (plus_one_count BETWEEN 0 AND 20),
  dietary_notes TEXT NOT NULL DEFAULT '',
  accessibility_notes TEXT NOT NULL DEFAULT '',
  organizer_notes TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plan_guests_trip ON plan_guests(trip_id, rsvp_status);

CREATE TABLE IF NOT EXISTS plan_rsvp_invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  guest_id TEXT REFERENCES plan_guests(id) ON DELETE CASCADE,
  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 500),
  use_count INTEGER NOT NULL DEFAULT 0,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_plan_rsvp_invites_trip ON plan_rsvp_invites(trip_id, created_at DESC);

CREATE TABLE IF NOT EXISTS plan_date_polls (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  deadline_at TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'closed')),
  locked_option_id TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plan_date_polls_trip ON plan_date_polls(trip_id, status);

CREATE TABLE IF NOT EXISTS plan_date_options (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL REFERENCES plan_date_polls(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plan_date_options_poll ON plan_date_options(poll_id, sort_order);

CREATE TABLE IF NOT EXISTS plan_date_votes (
  option_id TEXT NOT NULL REFERENCES plan_date_options(id) ON DELETE CASCADE,
  actor_key TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  guest_id TEXT REFERENCES plan_guests(id) ON DELETE CASCADE,
  value TEXT NOT NULL CHECK (value IN ('preferred', 'available', 'maybe', 'unavailable')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (option_id, actor_key),
  CHECK ((user_id IS NOT NULL AND guest_id IS NULL) OR (user_id IS NULL AND guest_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trip_id TEXT REFERENCES trips(id) ON DELETE CASCADE,
  storage_key TEXT UNIQUE NOT NULL,
  purpose TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'plan')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'rejected', 'deleted')),
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  checksum TEXT,
  original_name TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_assets_owner ON assets(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_plan ON assets(trip_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wardrobe_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '',
  material TEXT NOT NULL DEFAULT '',
  pattern TEXT NOT NULL DEFAULT '',
  season_json TEXT NOT NULL DEFAULT '[]',
  warmth TEXT NOT NULL DEFAULT '',
  formality TEXT NOT NULL DEFAULT '',
  activity_json TEXT NOT NULL DEFAULT '[]',
  weather_json TEXT NOT NULL DEFAULT '[]',
  coverage_json TEXT NOT NULL DEFAULT '[]',
  care_notes TEXT NOT NULL DEFAULT '',
  availability TEXT NOT NULL DEFAULT 'available'
    CHECK (availability IN ('available', 'packed', 'laundry', 'unavailable')),
  notes TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_user ON wardrobe_items(user_id, category, updated_at DESC);

CREATE TABLE IF NOT EXISTS wardrobe_item_assets (
  wardrobe_item_id TEXT NOT NULL REFERENCES wardrobe_items(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  PRIMARY KEY (wardrobe_item_id, asset_id)
);

CREATE TABLE IF NOT EXISTS outfits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  cover_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  occasion TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outfits_user ON outfits(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS outfit_items (
  outfit_id TEXT NOT NULL REFERENCES outfits(id) ON DELETE CASCADE,
  wardrobe_item_id TEXT NOT NULL REFERENCES wardrobe_items(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (outfit_id, wardrobe_item_id)
);

CREATE TABLE IF NOT EXISTS packing_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'merge' CHECK (mode IN ('merge', 'replace_generated', 'new_section')),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_packing_templates_user ON packing_templates(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS packing_template_items (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES packing_templates(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('wardrobe', 'miscellaneous')),
  subcategory TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 999),
  always_add INTEGER NOT NULL DEFAULT 0 CHECK (always_add IN (0, 1)),
  condition_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_packing_template_items_template
  ON packing_template_items(template_id, sort_order);

CREATE TABLE IF NOT EXISTS plan_packing_sections (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL CHECK (visibility IN ('private', 'shared')),
  category TEXT NOT NULL CHECK (category IN ('wardrobe', 'miscellaneous')),
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((visibility = 'private' AND owner_user_id IS NOT NULL) OR visibility = 'shared')
);
CREATE INDEX IF NOT EXISTS idx_plan_packing_sections_plan
  ON plan_packing_sections(trip_id, visibility, owner_user_id, sort_order);

CREATE TABLE IF NOT EXISTS plan_packing_items (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL REFERENCES plan_packing_sections(id) ON DELETE CASCADE,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  assigned_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  wardrobe_item_id TEXT REFERENCES wardrobe_items(id) ON DELETE SET NULL,
  outfit_id TEXT REFERENCES outfits(id) ON DELETE SET NULL,
  source_template_id TEXT REFERENCES packing_templates(id) ON DELETE SET NULL,
  source_key TEXT,
  name TEXT NOT NULL,
  why TEXT NOT NULL DEFAULT '',
  subcategory TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 999),
  packed_quantity INTEGER NOT NULL DEFAULT 0 CHECK (packed_quantity BETWEEN 0 AND 999),
  state TEXT NOT NULL DEFAULT 'planned'
    CHECK (state IN ('considering', 'planned', 'packed', 'wearing', 'laundry', 'repack')),
  notes TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  client_mutation_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (packed_quantity <= quantity)
);
CREATE INDEX IF NOT EXISTS idx_plan_packing_items_plan
  ON plan_packing_items(trip_id, owner_user_id, state, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_packing_source
  ON plan_packing_items(trip_id, owner_user_id, source_template_id, source_key)
  WHERE source_template_id IS NOT NULL AND source_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_packing_mutation
  ON plan_packing_items(trip_id, client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS plan_bookings (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  booking_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idea'
    CHECK (status IN ('idea', 'shortlisted', 'needs_booking', 'booked', 'confirmed', 'completed', 'cancelled')),
  title TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  official_url TEXT NOT NULL DEFAULT '',
  confirmation_ciphertext TEXT,
  travelers_json TEXT NOT NULL DEFAULT '[]',
  starts_at TEXT,
  ends_at TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  location_json TEXT NOT NULL DEFAULT '{}',
  amount_minor INTEGER,
  currency TEXT,
  cancellation_at TEXT,
  cancellation_notes TEXT NOT NULL DEFAULT '',
  check_action_url TEXT NOT NULL DEFAULT '',
  check_deadline_at TEXT,
  schedule_item_id TEXT,
  source_url TEXT NOT NULL DEFAULT '',
  checked_at TEXT,
  assigned_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 1,
  client_mutation_id TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plan_bookings_plan ON plan_bookings(trip_id, status, starts_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_bookings_mutation
  ON plan_bookings(trip_id, client_mutation_id) WHERE client_mutation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS booking_assets (
  booking_id TEXT NOT NULL REFERENCES plan_bookings(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (booking_id, asset_id)
);

CREATE TABLE IF NOT EXISTS plan_budgets (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (trip_id, category, currency)
);

CREATE TABLE IF NOT EXISTS plan_expenses (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  state TEXT NOT NULL DEFAULT 'actual' CHECK (state IN ('estimated', 'committed', 'actual')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency TEXT NOT NULL,
  reporting_amount_minor INTEGER,
  reporting_currency TEXT,
  exchange_rate_text TEXT,
  exchange_rate_source TEXT,
  exchange_rate_date TEXT,
  payer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  split_method TEXT NOT NULL DEFAULT 'equal'
    CHECK (split_method IN ('equal', 'percentage', 'shares', 'exact')),
  visibility TEXT NOT NULL DEFAULT 'shared' CHECK (visibility IN ('shared', 'private')),
  due_at TEXT,
  receipt_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  client_mutation_id TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plan_expenses_plan
  ON plan_expenses(trip_id, state, category, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_expenses_mutation
  ON plan_expenses(trip_id, client_mutation_id) WHERE client_mutation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS expense_splits (
  expense_id TEXT NOT NULL REFERENCES plan_expenses(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  percentage_micros INTEGER,
  shares INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (expense_id, user_id)
);

CREATE TABLE IF NOT EXISTS plan_settlements (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL,
  payment_provider TEXT NOT NULL DEFAULT 'manual',
  payment_reference TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'sender_confirmed', 'confirmed', 'disputed', 'cancelled')),
  revision INTEGER NOT NULL DEFAULT 1,
  client_mutation_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (from_user_id <> to_user_id)
);
CREATE INDEX IF NOT EXISTS idx_plan_settlements_plan
  ON plan_settlements(trip_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS settlement_confirmations (
  settlement_id TEXT NOT NULL REFERENCES plan_settlements(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('sender', 'recipient')),
  confirmed_at INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (settlement_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL DEFAULT '',
  scopes_json TEXT NOT NULL DEFAULT '[]',
  encrypted_tokens_json TEXT NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER,
  last_error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, provider, provider_account_id)
);
CREATE INDEX IF NOT EXISTS idx_user_connections_user
  ON user_connections(user_id, provider, updated_at DESC);

CREATE TABLE IF NOT EXISTS calendar_preferences (
  connection_id TEXT PRIMARY KEY REFERENCES user_connections(id) ON DELETE CASCADE,
  calendar_id_ciphertext TEXT,
  availability_enabled INTEGER NOT NULL DEFAULT 0 CHECK (availability_enabled IN (0, 1)),
  sync_mode TEXT NOT NULL DEFAULT 'selected'
    CHECK (sync_mode IN ('selected', 'bookings', 'assignments', 'full_schedule')),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS external_event_links (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES user_connections(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  provider_etag TEXT,
  sync_state TEXT NOT NULL DEFAULT 'synced'
    CHECK (sync_state IN ('pending', 'synced', 'conflict', 'deleted', 'error')),
  last_error TEXT NOT NULL DEFAULT '',
  last_synced_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (connection_id, source_type, source_id),
  UNIQUE (connection_id, provider_event_id)
);
CREATE INDEX IF NOT EXISTS idx_external_event_links_plan
  ON external_event_links(trip_id, sync_state, updated_at DESC);

CREATE TABLE IF NOT EXISTS notification_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trip_id TEXT REFERENCES trips(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'calendar', 'email', 'push')),
  offset_minutes INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notification_rules_user
  ON notification_rules(user_id, trip_id, enabled);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id TEXT PRIMARY KEY,
  rule_id TEXT REFERENCES notification_rules(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trip_id TEXT REFERENCES trips(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT UNIQUE NOT NULL,
  last_error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_due
  ON notification_outbox(status, due_at);
