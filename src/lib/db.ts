import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

/**
 * SQLite stands in for the Postgres the spec calls for. The schema is kept
 * Postgres-shaped — uuid primary keys, real foreign keys, a join table — so the
 * queries port over unchanged when a DATABASE_URL shows up.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS people (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  how_we_met         TEXT,
  company            TEXT,
  role               TEXT,
  city               TEXT,
  birthday_month     INTEGER,          -- 1-12, birthdays are often day+month only
  birthday_day       INTEGER,          -- 1-31
  birthday_year      INTEGER,          -- null when unknown; never guessed
  cadence_days       INTEGER,          -- null means no nudging for this person
  notes              TEXT,
  last_contacted_at  TEXT,             -- date, denormalised from interactions
  snoozed_until      TEXT,             -- date
  created_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interactions (
  id           TEXT PRIMARY KEY,
  person_id    TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  occurred_on  TEXT NOT NULL,          -- date only; time adds nothing here
  channel      TEXT NOT NULL,          -- met | call | message | email
  summary      TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_interactions_person ON interactions(person_id, occurred_on DESC);

CREATE TABLE IF NOT EXISTS tags (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  kind  TEXT                            -- context | industry | city | strength
);

CREATE TABLE IF NOT EXISTS people_tags (
  person_id  TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (person_id, tag_id)
);

CREATE TABLE IF NOT EXISTS introductions (
  id                 TEXT PRIMARY KEY,
  person_id          TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  introduced_by_id   TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  occurred_on        TEXT,
  UNIQUE (person_id, introduced_by_id)
);

CREATE TABLE IF NOT EXISTS saved_views (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  filters     TEXT NOT NULL,           -- JSON
  created_at  TEXT NOT NULL
);

-- The spec's warning: log every raw input alongside its parsed output from day
-- one, so when the parse gets something wrong you can see exactly what it saw.
CREATE TABLE IF NOT EXISTS parse_logs (
  id            TEXT PRIMARY KEY,
  raw_input     TEXT NOT NULL,
  parsed_output TEXT,                  -- JSON
  source        TEXT NOT NULL,         -- llm | fallback
  error         TEXT,
  duration_ms   INTEGER,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS digests (
  id          TEXT PRIMARY KEY,
  sent_on     TEXT NOT NULL,
  person_ids  TEXT NOT NULL,           -- JSON array, in slot order
  html        TEXT NOT NULL,
  opened_at   TEXT,
  delivery    TEXT NOT NULL,           -- resend | file
  created_at  TEXT NOT NULL
);

-- One row. Holds the delivery cadence, which halves itself after three
-- consecutive unopened digests rather than continuing to shout into a void.
CREATE TABLE IF NOT EXISTS settings (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  digest_frequency   TEXT NOT NULL DEFAULT 'weekly',   -- weekly | fortnightly
  digest_email       TEXT,
  timezone           TEXT NOT NULL DEFAULT 'UTC'
);
INSERT OR IGNORE INTO settings (id) VALUES (1);

-- Nudge bookkeeping: what we showed, when, and what the user did about it.
CREATE TABLE IF NOT EXISTS nudges (
  id          TEXT PRIMARY KEY,
  person_id   TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  digest_id   TEXT REFERENCES digests(id) ON DELETE SET NULL,
  slot        TEXT NOT NULL,           -- birthday | overdue | wildcard
  score       REAL,
  shown_on    TEXT NOT NULL,
  outcome     TEXT                     -- logged | snoozed | cadence_changed | not_now
);
CREATE INDEX IF NOT EXISTS idx_nudges_person ON nudges(person_id, shown_on DESC);
`;

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const file = process.env.CRM_DB_PATH ?? path.join(process.cwd(), "data", "crm.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

export function uuid(): string {
  return crypto.randomUUID();
}
