-- Itinerary reactions: quero_ir / ja_fui
CREATE TABLE IF NOT EXISTS itinerary_reactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         VARCHAR(20) NOT NULL CHECK (type IN ('quero_ir', 'ja_fui')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (itinerary_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_itinerary_reactions_itinerary ON itinerary_reactions (itinerary_id);
CREATE INDEX IF NOT EXISTS idx_itinerary_reactions_user      ON itinerary_reactions (user_id);

-- Device sessions: track active refresh token sessions per user
CREATE TABLE IF NOT EXISTS device_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jti          VARCHAR(64) NOT NULL UNIQUE,
  device_name  VARCHAR(200),
  ip_address   INET,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_sessions_user    ON device_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_device_sessions_jti     ON device_sessions (jti);
CREATE INDEX IF NOT EXISTS idx_device_sessions_expires ON device_sessions (expires_at);
