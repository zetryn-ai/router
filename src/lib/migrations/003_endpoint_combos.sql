ALTER TABLE providers ADD COLUMN category TEXT NOT NULL DEFAULT 'other';
ALTER TABLE providers ADD COLUMN sticky_limit INTEGER NOT NULL DEFAULT 1;
ALTER TABLE providers ADD COLUMN is_llm INTEGER NOT NULL DEFAULT 0;
ALTER TABLE providers ADD COLUMN models_json TEXT;

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS combos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  strategy TEXT NOT NULL DEFAULT 'fallback' CHECK (strategy IN ('fallback','round_robin','fusion','capacity')),
  models_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
