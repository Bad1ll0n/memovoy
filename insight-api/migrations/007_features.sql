-- User badges (awarded once per code per user)
CREATE TABLE IF NOT EXISTS user_badges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_code VARCHAR(50) NOT NULL,
  awarded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, badge_code)
);

-- Itinerary comments
CREATE TABLE IF NOT EXISTS itinerary_comments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  content      TEXT NOT NULL CHECK (char_length(content) <= 2200),
  parent_id    UUID REFERENCES itinerary_comments(id)  ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iti_comments_iti ON itinerary_comments(itinerary_id, created_at DESC);
