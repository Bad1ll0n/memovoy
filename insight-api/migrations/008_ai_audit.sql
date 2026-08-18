-- AI response cache (7-day TTL enforced by app)
CREATE TABLE IF NOT EXISTS ai_cache (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key  VARCHAR(64) NOT NULL UNIQUE,
  response   JSONB        NOT NULL,
  created_at TIMESTAMPTZ  DEFAULT NOW(),
  expires_at TIMESTAMPTZ  NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_key     ON ai_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_ai_cache_expires ON ai_cache(expires_at);

-- Audit log for sensitive operations
CREATE TABLE IF NOT EXISTS audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(100) NOT NULL,
  details    JSONB,
  ip         VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, created_at DESC);
