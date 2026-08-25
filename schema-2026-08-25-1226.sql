-- Created: 2026-08-25 12:26 MST (America/Phoenix)
-- tearsheets D1 schema. Paste into the D1 dashboard console. No migrations.

CREATE TABLE IF NOT EXISTS instances (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  article_url   TEXT NOT NULL,
  image_url     TEXT NOT NULL,
  thumbnail_url TEXT,
  r2_key        TEXT,
  title         TEXT,
  source_domain TEXT NOT NULL,
  published_at  TEXT,
  snippet       TEXT,
  favicon       TEXT,
  dhash         TEXT,
  width         INTEGER,
  height        INTEGER,
  orientation   TEXT,              -- landscape | portrait | square
  frame_id      INTEGER,
  fetch_failed  INTEGER DEFAULT 0,
  found_by      TEXT NOT NULL,     -- comma list of variant keys that surfaced it
  verified      INTEGER NOT NULL DEFAULT 0,  -- 1 if any tight variant hit
  first_seen    TEXT NOT NULL,
  last_seen     TEXT NOT NULL,
  UNIQUE(article_url, image_url)
);

CREATE TABLE IF NOT EXISTS frames (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_instance_id INTEGER,
  dhash                 TEXT,
  event_date            TEXT,
  location              TEXT,
  league                TEXT,
  team_home             TEXT,
  team_away             TEXT,
  event_name            TEXT,
  player                TEXT,
  caption               TEXT,
  orientation           TEXT,
  featured              INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS domains (
  domain       TEXT PRIMARY KEY,
  include      INTEGER NOT NULL DEFAULT 1,
  type         TEXT NOT NULL DEFAULT 'publication', -- publication | distribution | social | stock
  display_name TEXT,
  frame_count  INTEGER NOT NULL DEFAULT 0,
  first_seen   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_instances_frame   ON instances(frame_id);
CREATE INDEX IF NOT EXISTS idx_instances_domain  ON instances(source_domain);
CREATE INDEX IF NOT EXISTS idx_instances_pub     ON instances(published_at);
CREATE INDEX IF NOT EXISTS idx_instances_nodhash ON instances(dhash) WHERE dhash IS NULL;

-- Seed the known metadata-only domains. License links, never cards.
INSERT OR IGNORE INTO domains (domain, include, type, display_name, first_seen) VALUES
  ('reutersconnect.com', 0, 'stock', 'Reuters Connect', datetime('now')),
  ('imagn.com',          0, 'stock', 'Imagn Images',    datetime('now')),
  ('usatsimg.com',       0, 'stock', 'USA TODAY Sports Images', datetime('now')),
  ('vecteezy.com',       0, 'stock', 'Vecteezy',        datetime('now'));
