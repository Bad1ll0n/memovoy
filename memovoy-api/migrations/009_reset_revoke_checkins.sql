-- Packing list drag-to-reorder
ALTER TABLE packing_items ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

-- Password reset tokens
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token         VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;

-- Refresh token revocation (stores jti of invalidated tokens)
CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti        VARCHAR(36) PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_revoked_expires ON revoked_tokens(expires_at);

-- Activity check-ins
CREATE TABLE IF NOT EXISTS activity_checkins (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  itinerary_id   UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  day_index      INT  NOT NULL,
  activity_index INT  NOT NULL,
  activity_name  VARCHAR(200),
  destination    VARCHAR(100),
  checked_in_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, itinerary_id, day_index, activity_index)
);
CREATE INDEX IF NOT EXISTS idx_checkins_user ON activity_checkins(user_id, checked_in_at DESC);

-- Itinerary collaborators (view + edit permissions)
CREATE TABLE IF NOT EXISTS itinerary_collaborators (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  role         VARCHAR(10) NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
  invited_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (itinerary_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_collab_itinerary ON itinerary_collaborators(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_collab_user      ON itinerary_collaborators(user_id);
