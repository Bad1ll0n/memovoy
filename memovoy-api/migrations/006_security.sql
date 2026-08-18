-- Email verification
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified        BOOLEAN      DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token    VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMPTZ;

-- Account lockout
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INT          DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until           TIMESTAMPTZ;

-- Presence & onboarding
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen              TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed   BOOLEAN      DEFAULT FALSE;
