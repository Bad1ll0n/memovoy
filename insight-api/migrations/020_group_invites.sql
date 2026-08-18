CREATE TABLE IF NOT EXISTS group_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES travel_groups(id) ON DELETE CASCADE,
  inviter_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       VARCHAR(64) UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status      VARCHAR(20) NOT NULL DEFAULT 'pending',
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, invitee_id)
);

CREATE INDEX IF NOT EXISTS idx_group_invites_token ON group_invites(token);
CREATE INDEX IF NOT EXISTS idx_group_invites_invitee ON group_invites(invitee_id, status);
