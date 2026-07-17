ALTER TABLE providers ADD COLUMN rotation_strategy TEXT NOT NULL DEFAULT 'round_robin';
ALTER TABLE providers ADD COLUMN default_inject_value_template TEXT;
ALTER TABLE credentials ADD COLUMN priority INTEGER NOT NULL DEFAULT 100;
