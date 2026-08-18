-- Migration 021: Performance indexes
-- Addresses: 14 missing FK indexes, composite feed index, pg_trgm for search,
--             duplicate ai_cache index removal.
-- Note: uses CREATE INDEX (not CONCURRENTLY) because migrations run inside a transaction.
-- For a live production DB, run CONCURRENTLY manually outside a transaction.

-- ── pg_trgm extension ─────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Composite index for feed query ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_posts_user_created
  ON posts (user_id, created_at DESC);

-- ── Trigram indexes for full-text search ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_username_trgm
  ON users USING GIN (lower(username) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_users_display_name_trgm
  ON users USING GIN (lower(display_name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_itineraries_title_trgm
  ON itineraries USING GIN (lower(title) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_itineraries_destination_trgm
  ON itineraries USING GIN (lower(destination) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_posts_caption_trgm
  ON posts USING GIN (lower(caption) gin_trgm_ops);

-- ── Missing FK indexes ────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_post_comments_user_id
  ON post_comments (user_id);

CREATE INDEX IF NOT EXISTS idx_post_comments_parent_id
  ON post_comments (parent_id)
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_actor_id
  ON notifications (actor_id)
  WHERE actor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_itinerary_id
  ON expenses (itinerary_id);

CREATE INDEX IF NOT EXISTS idx_expenses_user_id
  ON expenses (user_id);

CREATE INDEX IF NOT EXISTS idx_packing_items_itinerary_id
  ON packing_items (itinerary_id);

CREATE INDEX IF NOT EXISTS idx_packing_items_user_id
  ON packing_items (user_id);

CREATE INDEX IF NOT EXISTS idx_itinerary_comments_user_id
  ON itinerary_comments (user_id);

CREATE INDEX IF NOT EXISTS idx_itinerary_collaborators_invited_by
  ON itinerary_collaborators (invited_by)
  WHERE invited_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_itineraries_forked_from
  ON itineraries (forked_from)
  WHERE forked_from IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_feedback_user_id
  ON activity_feedback (user_id);

CREATE INDEX IF NOT EXISTS idx_activity_feedback_itinerary_id
  ON activity_feedback (itinerary_id);

CREATE INDEX IF NOT EXISTS idx_group_invites_inviter_id
  ON group_invites (inviter_id);

-- ── Remove duplicate index on ai_cache.cache_key ─────────────────────────────
DROP INDEX IF EXISTS idx_ai_cache_key;
