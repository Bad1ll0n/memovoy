-- Comment likes (post comments)
CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id UUID NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes(comment_id);

-- Itinerary forks tracker (optional, for analytics)
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS forked_from UUID REFERENCES itineraries(id) ON DELETE SET NULL;
ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS forks_count INT NOT NULL DEFAULT 0;

-- Activity feedback: records user choices when replacing activities with AI suggestions
CREATE TABLE IF NOT EXISTS activity_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  itinerary_id    UUID REFERENCES itineraries(id)    ON DELETE SET NULL,
  destination     TEXT NOT NULL,
  original_name   TEXT,
  feedback        TEXT NOT NULL,
  chosen_name     TEXT NOT NULL,
  chosen_activity JSONB NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_feedback_dest ON activity_feedback(destination);
