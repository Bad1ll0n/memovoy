-- Add AI moderation columns to content_reports
ALTER TABLE content_reports
  ADD COLUMN IF NOT EXISTS ai_severity  VARCHAR(10),
  ADD COLUMN IF NOT EXISTS ai_action    VARCHAR(10),
  ADD COLUMN IF NOT EXISTS ai_reasoning VARCHAR(200);

-- Index for quick access to high-severity unreviewed reports
CREATE INDEX IF NOT EXISTS idx_content_reports_severity
  ON content_reports (ai_severity)
  WHERE ai_severity IN ('high', 'critical');
