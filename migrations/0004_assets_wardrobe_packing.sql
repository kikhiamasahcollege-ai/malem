PRAGMA foreign_keys = ON;

CREATE TABLE assets (
  id             TEXT PRIMARY KEY,
  owner_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trip_id        TEXT REFERENCES trips(id) ON DELETE CASCADE,
  storage_key    TEXT UNIQUE NOT NULL,
  purpose        TEXT NOT NULL,
  visibility     TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'plan')),
  status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'rejected', 'deleted')),
  content_type   TEXT NOT NULL,
  byte_size      INTEGER NOT NULL DEFAULT 0,
  width          INTEGER,
  height         INTEGER,
  checksum       TEXT,
  original_name  TEXT NOT NULL DEFAULT '',
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  deleted_at     INTEGER
);
CREATE INDEX idx_assets_owner ON assets(owner_user_id, created_at DESC);
CREATE INDEX idx_assets_plan ON assets(trip_id, created_at DESC);

CREATE TABLE wardrobe_items (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,
  subcategory     TEXT NOT NULL DEFAULT '',
  color           TEXT NOT NULL DEFAULT '',
  material        TEXT NOT NULL DEFAULT '',
  pattern         TEXT NOT NULL DEFAULT '',
  season_json     TEXT NOT NULL DEFAULT '[]',
  warmth          TEXT NOT NULL DEFAULT '',
  formality       TEXT NOT NULL DEFAULT '',
  activity_json   TEXT NOT NULL DEFAULT '[]',
  weather_json    TEXT NOT NULL DEFAULT '[]',
  coverage_json   TEXT NOT NULL DEFAULT '[]',
  care_notes      TEXT NOT NULL DEFAULT '',
  availability   TEXT NOT NULL DEFAULT 'available'
    CHECK (availability IN ('available', 'packed', 'laundry', 'unavailable')),
  notes           TEXT NOT NULL DEFAULT '',
  revision        INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_wardrobe_items_user ON wardrobe_items(user_id, category, updated_at DESC);

CREATE TABLE wardrobe_item_assets (
  wardrobe_item_id TEXT NOT NULL REFERENCES wardrobe_items(id) ON DELETE CASCADE,
  asset_id         TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_primary       INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  PRIMARY KEY (wardrobe_item_id, asset_id)
);

CREATE TABLE outfits (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  cover_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  occasion       TEXT NOT NULL DEFAULT '',
  tags_json      TEXT NOT NULL DEFAULT '[]',
  notes          TEXT NOT NULL DEFAULT '',
  revision       INTEGER NOT NULL DEFAULT 1,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX idx_outfits_user ON outfits(user_id, updated_at DESC);

CREATE TABLE outfit_items (
  outfit_id        TEXT NOT NULL REFERENCES outfits(id) ON DELETE CASCADE,
  wardrobe_item_id TEXT NOT NULL REFERENCES wardrobe_items(id) ON DELETE CASCADE,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  notes            TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (outfit_id, wardrobe_item_id)
);

CREATE TABLE packing_templates (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mode        TEXT NOT NULL DEFAULT 'merge'
    CHECK (mode IN ('merge', 'replace_generated', 'new_section')),
  revision    INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_packing_templates_user ON packing_templates(user_id, updated_at DESC);

CREATE TABLE packing_template_items (
  id                 TEXT PRIMARY KEY,
  template_id        TEXT NOT NULL REFERENCES packing_templates(id) ON DELETE CASCADE,
  category           TEXT NOT NULL CHECK (category IN ('wardrobe', 'miscellaneous')),
  subcategory        TEXT NOT NULL DEFAULT '',
  name               TEXT NOT NULL,
  quantity           INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 999),
  always_add         INTEGER NOT NULL DEFAULT 0 CHECK (always_add IN (0, 1)),
  condition_json     TEXT NOT NULL DEFAULT '{}',
  notes              TEXT NOT NULL DEFAULT '',
  sort_order         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_packing_template_items_template
  ON packing_template_items(template_id, sort_order);

CREATE TABLE plan_packing_sections (
  id            TEXT PRIMARY KEY,
  trip_id       TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  visibility    TEXT NOT NULL CHECK (visibility IN ('private', 'shared')),
  category      TEXT NOT NULL CHECK (category IN ('wardrobe', 'miscellaneous')),
  title         TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  revision      INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  CHECK (
    (visibility = 'private' AND owner_user_id IS NOT NULL)
    OR visibility = 'shared'
  )
);
CREATE INDEX idx_plan_packing_sections_plan
  ON plan_packing_sections(trip_id, visibility, owner_user_id, sort_order);

CREATE TABLE plan_packing_items (
  id                    TEXT PRIMARY KEY,
  section_id            TEXT NOT NULL REFERENCES plan_packing_sections(id) ON DELETE CASCADE,
  trip_id               TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  owner_user_id         TEXT REFERENCES users(id) ON DELETE CASCADE,
  assigned_user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  wardrobe_item_id      TEXT REFERENCES wardrobe_items(id) ON DELETE SET NULL,
  outfit_id             TEXT REFERENCES outfits(id) ON DELETE SET NULL,
  source_template_id    TEXT REFERENCES packing_templates(id) ON DELETE SET NULL,
  source_key            TEXT,
  name                  TEXT NOT NULL,
  why                   TEXT NOT NULL DEFAULT '',
  subcategory           TEXT NOT NULL DEFAULT '',
  quantity              INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 999),
  packed_quantity       INTEGER NOT NULL DEFAULT 0 CHECK (packed_quantity BETWEEN 0 AND 999),
  state                 TEXT NOT NULL DEFAULT 'planned'
    CHECK (state IN ('considering', 'planned', 'packed', 'wearing', 'laundry', 'repack')),
  notes                 TEXT NOT NULL DEFAULT '',
  sort_order            INTEGER NOT NULL DEFAULT 0,
  revision              INTEGER NOT NULL DEFAULT 1,
  client_mutation_id    TEXT,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  CHECK (packed_quantity <= quantity)
);
CREATE INDEX idx_plan_packing_items_plan
  ON plan_packing_items(trip_id, owner_user_id, state, sort_order);
CREATE UNIQUE INDEX idx_plan_packing_source
  ON plan_packing_items(trip_id, owner_user_id, source_template_id, source_key)
  WHERE source_template_id IS NOT NULL AND source_key IS NOT NULL;
CREATE UNIQUE INDEX idx_plan_packing_mutation
  ON plan_packing_items(trip_id, client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;
