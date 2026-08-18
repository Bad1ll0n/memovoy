-- Travel groups
CREATE TABLE IF NOT EXISTS travel_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  destination TEXT,
  is_private  BOOLEAN NOT NULL DEFAULT FALSE,
  cover_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travel_groups_owner ON travel_groups(owner_id);
CREATE INDEX IF NOT EXISTS idx_travel_groups_dest  ON travel_groups(destination);

-- Group membership
CREATE TABLE IF NOT EXISTS group_members (
  group_id  UUID NOT NULL REFERENCES travel_groups(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id)          ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);

-- Posts can be shared to a group
ALTER TABLE posts ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES travel_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_posts_group ON posts(group_id) WHERE group_id IS NOT NULL;
