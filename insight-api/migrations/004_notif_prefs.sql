ALTER TABLE users ADD COLUMN IF NOT EXISTS notif_prefs JSONB NOT NULL DEFAULT '{"likes":true,"comments":true,"follows":true,"messages":true}';
