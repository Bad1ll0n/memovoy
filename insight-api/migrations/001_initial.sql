-- ─── INSIGHT — Initial Schema ────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Users ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  bio           TEXT,
  avatar_url    TEXT,
  cover_url     TEXT,
  is_private    BOOLEAN NOT NULL DEFAULT FALSE,
  is_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  score         INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users (lower(username));
CREATE INDEX IF NOT EXISTS idx_users_email    ON users (lower(email));

-- ─── Posts ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS posts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caption        TEXT NOT NULL DEFAULT '',
  images         JSONB NOT NULL DEFAULT '[]',
  destination    TEXT,
  region         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_user_id    ON posts (user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_region     ON posts (region);

-- ─── Post Likes ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS post_likes (
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

-- ─── Post Comments ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS post_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id  UUID REFERENCES post_comments(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  likes      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_post_id ON post_comments (post_id);

-- ─── Follows ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS follows (
  follower_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_following ON follows (following_id);

-- ─── Itineraries ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS itineraries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  destination  TEXT NOT NULL,
  country      TEXT,
  continent    TEXT,
  start_date   DATE,
  end_date     DATE,
  group_type   TEXT,
  travel_style JSONB  NOT NULL DEFAULT '[]',
  transport    JSONB  NOT NULL DEFAULT '[]',
  budget       NUMERIC(10,2),
  data         JSONB  NOT NULL DEFAULT '{}',
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  is_public    BOOLEAN NOT NULL DEFAULT TRUE,
  saves_count  INTEGER NOT NULL DEFAULT 0,
  views_count  INTEGER NOT NULL DEFAULT 0,
  cover_url    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_itineraries_user_id ON itineraries (user_id);
CREATE INDEX IF NOT EXISTS idx_itineraries_dest    ON itineraries (country);
CREATE INDEX IF NOT EXISTS idx_itineraries_created ON itineraries (created_at DESC);

-- ─── Bookmarks ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bookmarks (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id       UUID REFERENCES posts(id) ON DELETE CASCADE,
  itinerary_id  UUID REFERENCES itineraries(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (post_id IS NOT NULL AND itinerary_id IS NULL) OR
    (post_id IS NULL AND itinerary_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookmarks_post      ON bookmarks (user_id, post_id) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookmarks_itinerary ON bookmarks (user_id, itinerary_id) WHERE itinerary_id IS NOT NULL;

-- ─── Conversations ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_participants ON conversation_participants (user_id);

-- ─── Messages ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conv    ON messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender  ON messages (sender_id);

-- ─── Notifications ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  type         TEXT NOT NULL,   -- like | follow | comment | badge | mention
  target_url   TEXT,
  message      TEXT NOT NULL,
  read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread    ON notifications (recipient_id) WHERE NOT read;

-- ─── Expenses ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS expenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount       NUMERIC(10,2) NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'EUR',
  category     TEXT NOT NULL,
  description  TEXT,
  expense_date DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Packing items ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS packing_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  packed       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Updated_at trigger ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER itineraries_updated_at BEFORE UPDATE ON itineraries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
