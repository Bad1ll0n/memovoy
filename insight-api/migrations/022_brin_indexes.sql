-- ─── SCALE-5: BRIN indexes on append-only time-series columns ─────────────────
--
-- BRIN (Block Range INdex) stores min/max values per 128-page block range.
-- ~100-1000x smaller than B-tree, zero maintenance overhead, effective when
-- rows are physically inserted in timestamp order (append-only tables).
--
-- Existing B-tree indexes on created_at columns (idx_posts_created_at, etc.)
-- handle point lookups and bounded range scans used by the feed cursor.
-- BRIN complements them for unbounded time-range queries (analytics, cleanup
-- jobs) and becomes the primary index once these tables reach 10M+ rows.
--
-- These indexes are created without CONCURRENTLY (migration runner wraps in
-- a transaction). On a live production DB, run CREATE INDEX CONCURRENTLY
-- manually outside a transaction before deploying.

-- Posts — high write rate, physically ordered by created_at
CREATE INDEX IF NOT EXISTS idx_posts_created_at_brin
  ON posts USING BRIN (created_at);

-- Messages — append-only, ordered by created_at per conversation
CREATE INDEX IF NOT EXISTS idx_messages_created_at_brin
  ON messages USING BRIN (created_at);

-- Notifications — append-only fan-out table
CREATE INDEX IF NOT EXISTS idx_notifications_created_at_brin
  ON notifications USING BRIN (created_at);

-- Post likes — append-only event table
CREATE INDEX IF NOT EXISTS idx_post_likes_created_at_brin
  ON post_likes USING BRIN (created_at);

-- Post comments — append-only
CREATE INDEX IF NOT EXISTS idx_post_comments_created_at_brin
  ON post_comments USING BRIN (created_at);

-- Follows — append-only social graph events
CREATE INDEX IF NOT EXISTS idx_follows_created_at_brin
  ON follows USING BRIN (created_at);

-- Expenses — append-only financial log
CREATE INDEX IF NOT EXISTS idx_expenses_created_at_brin
  ON expenses USING BRIN (created_at);
