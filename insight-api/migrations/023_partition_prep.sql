-- ─── SCALE-3: Partition readiness for high-volume append-only tables ──────────
--
-- Full RANGE partitioning of existing tables requires recreating them (pg 10+
-- supports declarative partitioning but not converting an existing table in-place).
-- This migration installs the infrastructure: helper function, partition catalog
-- table, and pg_partman extension if available. The actual table conversion
-- must be performed during a maintenance window using the procedure below.
--
-- Candidate tables: notifications, messages, post_likes
-- Partition strategy: RANGE by created_at MONTHLY
-- Retention: notifications 12 months, messages 24 months, post_likes permanent
--
-- ─── MANUAL CONVERSION PROCEDURE (run during maintenance window) ──────────────
--
-- For each table (example: notifications):
--
--   BEGIN;
--   -- 1. Rename old table
--   ALTER TABLE notifications RENAME TO notifications_old;
--
--   -- 2. Create new partitioned table (same columns, no FK from parent)
--   CREATE TABLE notifications (
--     id           UUID NOT NULL DEFAULT gen_random_uuid(),
--     recipient_id UUID NOT NULL,
--     actor_id     UUID,
--     type         TEXT NOT NULL,
--     target_url   TEXT,
--     message      TEXT NOT NULL,
--     read         BOOLEAN NOT NULL DEFAULT FALSE,
--     created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
--   ) PARTITION BY RANGE (created_at);
--
--   -- 3. Recreate indexes on parent (inherited by partitions)
--   CREATE INDEX ON notifications (recipient_id, created_at DESC);
--   CREATE INDEX ON notifications (recipient_id) WHERE NOT read;
--
--   -- 4. Create monthly partitions for the relevant range
--   CREATE TABLE notifications_2025_01 PARTITION OF notifications
--     FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
--   -- ... repeat for each month ...
--
--   -- 5. Copy data
--   INSERT INTO notifications SELECT * FROM notifications_old;
--
--   -- 6. Add FKs on parent
--   ALTER TABLE notifications
--     ADD CONSTRAINT notifications_recipient_fk FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE;
--
--   -- 7. Drop old table
--   DROP TABLE notifications_old;
--   COMMIT;
-- ─────────────────────────────────────────────────────────────────────────────

-- Install pg_partman if available (optional — provides auto-partition management)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_partman WITH SCHEMA partman;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_partman not available — skipping. Install from pgxn.org for auto-partition management.';
END;
$$;

-- Partition manifest — tracks which tables are partitioned and their strategy
CREATE TABLE IF NOT EXISTS _partition_manifest (
  table_name   TEXT PRIMARY KEY,
  strategy     TEXT NOT NULL DEFAULT 'RANGE',
  column_name  TEXT NOT NULL DEFAULT 'created_at',
  interval     TEXT NOT NULL DEFAULT '1 month',
  retain_months INTEGER,
  converted_at TIMESTAMPTZ,
  notes        TEXT
);

INSERT INTO _partition_manifest (table_name, column_name, interval, retain_months, notes)
VALUES
  ('notifications', 'created_at', '1 month', 12,
   'Fan-out table grows O(users * events). Partition by month, drop partitions >12mo.'),
  ('messages',      'created_at', '1 month', 24,
   'Conversation messages. Partition by month, archive >24mo to cold storage.'),
  ('post_likes',    'created_at', '1 month', NULL,
   'Event table. Partition by month for analytics; no automatic retention.')
ON CONFLICT (table_name) DO NOTHING;

-- Auto-create next month's partition (call from a cron or pg_cron job)
CREATE OR REPLACE FUNCTION create_next_month_partition(
  p_table     TEXT,
  p_for_date  DATE DEFAULT date_trunc('month', NOW() + INTERVAL '1 month')::DATE
)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  partition_name TEXT;
  start_date     DATE;
  end_date       DATE;
BEGIN
  start_date     := date_trunc('month', p_for_date)::DATE;
  end_date       := (start_date + INTERVAL '1 month')::DATE;
  partition_name := p_table || '_' || to_char(start_date, 'YYYY_MM');

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
    partition_name, p_table, start_date, end_date
  );
END;
$$;

COMMENT ON FUNCTION create_next_month_partition IS
  'Call monthly (e.g. via pg_cron: 0 0 25 * *) to pre-create next month partition before data arrives.';
