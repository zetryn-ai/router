CREATE TABLE IF NOT EXISTS providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  default_inject_location TEXT NOT NULL CHECK (default_inject_location IN ('query','header','path')),
  default_inject_key_name TEXT,
  default_base_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  base_url_override TEXT,
  secret_value TEXT NOT NULL,
  inject_location_override TEXT CHECK (inject_location_override IN ('query','header','path') OR inject_location_override IS NULL),
  inject_key_name_override TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cooldown','disabled','error')),
  cooldown_until TEXT,
  last_used_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credential_id INTEGER REFERENCES credentials(id) ON DELETE SET NULL,
  provider_slug TEXT NOT NULL,
  status_code INTEGER,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credentials_provider_id ON credentials(provider_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at);
