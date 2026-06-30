-- ============================================================
-- MemoVoy — V5: Domínio Gamificação
-- badges, challenges, user_badges, user_challenges,
-- streaks, leaderboard_entries
-- ============================================================

-- ------------------------------------------------------------
-- BADGES — definição dos emblemas (criado ANTES de challenges por FK)
-- ------------------------------------------------------------
CREATE TABLE badges (
  id          UUID        PRIMARY KEY DEFAULT generate_ulid(),
  name        VARCHAR(60) NOT NULL,
  description TEXT,
  icon_url    TEXT        NOT NULL,
  category    VARCHAR(30) NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT badges_name_uq     UNIQUE (name),
  CONSTRAINT badges_category_chk CHECK (category IN ('challenge', 'level', 'special', 'social', 'sustainability'))
);

COMMENT ON COLUMN badges.category IS 'sustainability: badges de viagem verde / carbono baixo.';

-- ------------------------------------------------------------
-- CHALLENGES — definição dos desafios disponíveis
-- ------------------------------------------------------------
CREATE TABLE challenges (
  id              UUID                    PRIMARY KEY DEFAULT generate_ulid(),
  title           VARCHAR(120)            NOT NULL,
  description     TEXT,
  type            VARCHAR(30)             NOT NULL,
  target_value    INTEGER                 NOT NULL,
  location_filter GEOGRAPHY(POLYGON, 4326),
  location_name   VARCHAR(100),
  badge_id        UUID                    REFERENCES badges(id),
  starts_at       TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,
  is_active       BOOLEAN                 NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW(),

  CONSTRAINT challenges_type_chk         CHECK (type IN ('distance_km', 'visit_places', 'post_count', 'save_count', 'country_count', 'low_carbon')),
  CONSTRAINT challenges_target_value_chk CHECK (target_value > 0),
  CONSTRAINT challenges_dates_chk        CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

COMMENT ON COLUMN challenges.location_filter IS 'GEOGRAPHY(POLYGON) — NULL significa qualquer localização.';
COMMENT ON COLUMN challenges.type            IS 'low_carbon: desafio de viagem sustentável.';

-- ------------------------------------------------------------
-- USER_BADGES — badges ganhos por utilizadores
-- ------------------------------------------------------------
CREATE TABLE user_badges (
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id     UUID        NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  challenge_id UUID        REFERENCES challenges(id),

  PRIMARY KEY (user_id, badge_id)
);

COMMENT ON TABLE user_badges IS 'PK composta garante que um utilizador não pode ganhar o mesmo badge duas vezes.';

-- ------------------------------------------------------------
-- USER_CHALLENGES — progresso por utilizador
-- ------------------------------------------------------------
CREATE TABLE user_challenges (
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id  UUID        NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  current_value INTEGER     NOT NULL DEFAULT 0,
  status        VARCHAR(20) NOT NULL DEFAULT 'in_progress',
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,

  PRIMARY KEY (user_id, challenge_id),
  CONSTRAINT user_challenges_status_chk CHECK (status IN ('in_progress', 'completed', 'expired')),
  CONSTRAINT user_challenges_value_chk  CHECK (current_value >= 0),
  CONSTRAINT user_challenges_dates_chk  CHECK (completed_at IS NULL OR completed_at >= started_at)
);

-- ------------------------------------------------------------
-- STREAKS — streaks mensais de publicação
-- ------------------------------------------------------------
CREATE TABLE streaks (
  user_id               UUID      PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_streak        SMALLINT  NOT NULL DEFAULT 0,
  longest_streak        SMALLINT  NOT NULL DEFAULT 0,
  last_activity_month   DATE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT streaks_current_chk CHECK (current_streak >= 0),
  CONSTRAINT streaks_longest_chk CHECK (longest_streak >= current_streak)
);

COMMENT ON COLUMN streaks.last_activity_month IS 'Primeiro dia do último mês com atividade. Ex: 2026-06-01.';

CREATE TRIGGER trg_streaks_updated_at
  BEFORE UPDATE ON streaks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- LEADERBOARD_ENTRIES — rankings mensais
-- ------------------------------------------------------------
CREATE TABLE leaderboard_entries (
  id                UUID        PRIMARY KEY DEFAULT generate_ulid(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leaderboard_type  VARCHAR(30) NOT NULL,
  scope_id          UUID,
  period_start      DATE        NOT NULL,
  score             INTEGER     NOT NULL DEFAULT 0,
  rank              INTEGER,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT leaderboard_type_chk   CHECK (leaderboard_type IN ('top_countries', 'challenge', 'global_trips', 'low_carbon')),
  CONSTRAINT leaderboard_score_chk  CHECK (score >= 0),
  CONSTRAINT leaderboard_rank_chk   CHECK (rank IS NULL OR rank >= 1),
  CONSTRAINT leaderboard_unique_entry UNIQUE (user_id, leaderboard_type, scope_id, period_start)
);

COMMENT ON COLUMN leaderboard_entries.scope_id      IS 'ID do desafio se type=challenge. NULL para leaderboards globais.';
COMMENT ON COLUMN leaderboard_entries.period_start  IS 'Primeiro dia do período. Ex: 2026-06-01.';
COMMENT ON COLUMN leaderboard_entries.rank          IS 'Calculado periodicamente — não em tempo real.';

CREATE TRIGGER trg_leaderboard_updated_at
  BEFORE UPDATE ON leaderboard_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- ÍNDICES — Domínio Gamificação
-- ============================================================

-- Desafios activos
CREATE INDEX idx_challenges_active
  ON challenges(is_active, starts_at, ends_at)
  WHERE is_active = true;

-- Progresso de desafios de um utilizador
CREATE INDEX idx_user_challenges_user
  ON user_challenges(user_id, status);

-- Badges de um utilizador
CREATE INDEX idx_user_badges_user
  ON user_badges(user_id, earned_at DESC);

-- Leaderboard mensal por tipo
CREATE INDEX idx_leaderboard_period
  ON leaderboard_entries(leaderboard_type, period_start, score DESC)
  WHERE rank IS NOT NULL;
