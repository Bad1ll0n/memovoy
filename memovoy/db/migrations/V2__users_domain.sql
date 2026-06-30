-- ============================================================
-- MemoVoy — V2: Domínio Utilizadores
-- users, user_profiles, user_preferences,
-- user_devices, user_sessions, follows
-- ============================================================

-- ------------------------------------------------------------
-- USERS — entidade core de autenticação
-- ------------------------------------------------------------
CREATE TABLE users (
  id                    UUID          PRIMARY KEY DEFAULT generate_ulid(),
  email_encrypted       TEXT          NOT NULL,
  email_hash            TEXT          NOT NULL,
  username              VARCHAR(30)   NOT NULL,
  password_hash         TEXT,
  auth_provider         VARCHAR(20)   NOT NULL DEFAULT 'email',
  auth_provider_id      TEXT,
  db_region             VARCHAR(20)   NOT NULL,
  country_code          CHAR(2),
  language              VARCHAR(10)   NOT NULL DEFAULT 'pt-PT',
  role                  VARCHAR(20)   NOT NULL DEFAULT 'user',
  mfa_enabled           BOOLEAN       NOT NULL DEFAULT false,
  mfa_secret_encrypted  TEXT,
  is_verified           BOOLEAN       NOT NULL DEFAULT false,
  is_private            BOOLEAN       NOT NULL DEFAULT false,
  follower_count        INTEGER       NOT NULL DEFAULT 0,
  gdpr_consent_at       TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT users_email_hash_uq        UNIQUE (email_hash),
  CONSTRAINT users_username_uq          UNIQUE (username),
  CONSTRAINT users_username_format      CHECK (username ~ '^[a-z0-9_]{3,30}$'),
  CONSTRAINT users_auth_provider_chk    CHECK (auth_provider IN ('email', 'google', 'apple')),
  CONSTRAINT users_db_region_chk        CHECK (db_region IN ('eu-central-1', 'sa-east-1')),
  CONSTRAINT users_role_chk             CHECK (role IN ('user', 'creator', 'moderator', 'admin')),
  CONSTRAINT users_follower_count_chk   CHECK (follower_count >= 0),
  CONSTRAINT users_auth_provider_id_uq  UNIQUE (auth_provider, auth_provider_id)
);

COMMENT ON TABLE  users IS 'Entidade core de autenticação. Dados mínimos — resto em user_profiles.';
COMMENT ON COLUMN users.email_encrypted IS 'Email cifrado com AES-256 via pgcrypto. Nunca em claro.';
COMMENT ON COLUMN users.email_hash IS 'SHA-256 do email normalizado. Usado para lookup em login.';
COMMENT ON COLUMN users.db_region IS 'Região de dados — imutável após registo. RGPD/LGPD compliance.';
COMMENT ON COLUMN users.follower_count IS 'Desnormalizado. Threshold >10k activa fan-out on read.';

-- ------------------------------------------------------------
-- USER_PROFILES — dados públicos do perfil
-- ------------------------------------------------------------
CREATE TABLE user_profiles (
  user_id           UUID          PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name      VARCHAR(60)   NOT NULL,
  bio               TEXT,
  avatar_url        TEXT,
  location_text     VARCHAR(100),
  countries_visited CHAR(2)[],
  total_trips       INTEGER       NOT NULL DEFAULT 0,
  total_countries   INTEGER       NOT NULL DEFAULT 0,
  following_count   INTEGER       NOT NULL DEFAULT 0,
  level             VARCHAR(20)   NOT NULL DEFAULT 'explorer',
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT user_profiles_total_trips_chk    CHECK (total_trips >= 0),
  CONSTRAINT user_profiles_total_countries_chk CHECK (total_countries >= 0),
  CONSTRAINT user_profiles_following_count_chk CHECK (following_count >= 0),
  CONSTRAINT user_profiles_level_chk CHECK (level IN ('explorer', 'traveler', 'nomad', 'globetrotter'))
);

CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- USER_PREFERENCES — preferências e configurações
-- ------------------------------------------------------------
CREATE TABLE user_preferences (
  user_id               UUID          PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  travel_styles         TEXT[],
  dream_destinations    TEXT[],
  dietary_restrictions  TEXT[],
  default_group_type    VARCHAR(20),
  default_transport     TEXT[],
  default_budget        INTEGER,
  notification_push     BOOLEAN       NOT NULL DEFAULT true,
  notification_geo      BOOLEAN       NOT NULL DEFAULT false,
  notification_email    BOOLEAN       NOT NULL DEFAULT true,
  theme                 VARCHAR(20)   NOT NULL DEFAULT 'system',
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT user_preferences_group_type_chk CHECK (
    default_group_type IS NULL OR
    default_group_type IN ('solo', 'couple', 'friends', 'family')
  ),
  CONSTRAINT user_preferences_theme_chk CHECK (
    theme IN ('system', 'light', 'dark', 'auto_time')
  ),
  CONSTRAINT user_preferences_budget_chk CHECK (
    default_budget IS NULL OR default_budget > 0
  )
);

COMMENT ON COLUMN user_preferences.theme IS 'Dark mode: system|light|dark|auto_time(21h-7h).';
COMMENT ON COLUMN user_preferences.notification_geo IS 'Requer permissão explícita do utilizador.';

CREATE TRIGGER trg_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- USER_DEVICES — dispositivos para push notifications e anomaly detection
-- ------------------------------------------------------------
CREATE TABLE user_devices (
  id                    UUID          PRIMARY KEY DEFAULT generate_ulid(),
  user_id               UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id             TEXT          NOT NULL,
  platform              VARCHAR(10)   NOT NULL,
  push_token            TEXT,
  push_token_updated_at TIMESTAMPTZ,
  device_name           VARCHAR(100),
  is_trusted            BOOLEAN       NOT NULL DEFAULT false,
  last_seen_at          TIMESTAMPTZ,
  last_ip_country       CHAR(2),
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT user_devices_platform_chk   CHECK (platform IN ('ios', 'android', 'web')),
  CONSTRAINT user_devices_device_user_uq UNIQUE (device_id, user_id)
);

COMMENT ON COLUMN user_devices.is_trusted IS 'True após confirmação MFA — sem step-up auth em logins seguintes.';
COMMENT ON COLUMN user_devices.push_token IS 'FCM (Android/Web) ou APNs (iOS). Atualizar a cada login.';

-- ------------------------------------------------------------
-- USER_SESSIONS — sessões ativas para anomaly detection e revogação
-- ------------------------------------------------------------
CREATE TABLE user_sessions (
  id                UUID        PRIMARY KEY DEFAULT generate_ulid(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_fingerprint TEXT,
  ip_country        CHAR(2),
  is_suspicious     BOOLEAN     NOT NULL DEFAULT false,
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at        TIMESTAMPTZ,

  CONSTRAINT user_sessions_expires_future_chk CHECK (expires_at > created_at)
);

COMMENT ON COLUMN user_sessions.id IS '= jti do refresh token JWT.';
COMMENT ON COLUMN user_sessions.is_suspicious IS 'True = login de país diferente do habitual → step-up auth.';

-- ------------------------------------------------------------
-- FOLLOWS — grafo de seguidores
-- ------------------------------------------------------------
CREATE TABLE follows (
  follower_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT follows_no_self_follow_chk CHECK (follower_id != following_id),
  CONSTRAINT follows_status_chk         CHECK (status IN ('active', 'pending'))
);

COMMENT ON CONSTRAINT follows_no_self_follow_chk ON follows IS 'Impede utilizador de seguir-se a si próprio.';

-- ============================================================
-- ÍNDICES — Domínio Utilizadores
-- ============================================================

-- Login (caminho mais crítico)
CREATE UNIQUE INDEX idx_users_email_hash
  ON users(email_hash)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_users_username
  ON users(username)
  WHERE deleted_at IS NULL;

-- Pesquisa por username (full-text)
CREATE INDEX idx_users_username_trgm
  ON users USING GIN(username gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- Social graph: "quem me segue"
CREATE INDEX idx_follows_following
  ON follows(following_id, follower_id)
  WHERE status = 'active';

-- Social graph: "quem eu sigo"
CREATE INDEX idx_follows_follower
  ON follows(follower_id, following_id)
  WHERE status = 'active';

-- Sessões ativas por utilizador
CREATE INDEX idx_sessions_user_active
  ON user_sessions(user_id, created_at DESC)
  WHERE revoked_at IS NULL;

-- Push tokens válidos por utilizador
CREATE INDEX idx_devices_user_push
  ON user_devices(user_id)
  WHERE push_token IS NOT NULL;

-- ============================================================
-- TRIGGERS — Contadores de follows
-- ============================================================

CREATE OR REPLACE FUNCTION fn_update_follow_counts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    UPDATE users
      SET follower_count = follower_count + 1
      WHERE id = NEW.following_id;
    UPDATE user_profiles
      SET following_count = following_count + 1
      WHERE user_id = NEW.follower_id;

  ELSIF TG_OP = 'DELETE' AND OLD.status = 'active' THEN
    UPDATE users
      SET follower_count = GREATEST(follower_count - 1, 0)
      WHERE id = OLD.following_id;
    UPDATE user_profiles
      SET following_count = GREATEST(following_count - 1, 0)
      WHERE user_id = OLD.follower_id;

  ELSIF TG_OP = 'UPDATE' THEN
    -- pending → active (conta privada aprovada)
    IF OLD.status = 'pending' AND NEW.status = 'active' THEN
      UPDATE users
        SET follower_count = follower_count + 1
        WHERE id = NEW.following_id;
      UPDATE user_profiles
        SET following_count = following_count + 1
        WHERE user_id = NEW.follower_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_follow_counts
  AFTER INSERT OR UPDATE OR DELETE ON follows
  FOR EACH ROW EXECUTE FUNCTION fn_update_follow_counts();
