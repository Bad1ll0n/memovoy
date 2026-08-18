CREATE TABLE IF NOT EXISTS content_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type  VARCHAR(20) NOT NULL CHECK (target_type IN ('post', 'comment', 'itinerary', 'user')),
  target_id    UUID NOT NULL,
  reason       VARCHAR(50) NOT NULL,
  detail       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reporter_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_content_reports_target ON content_reports (target_type, target_id);
