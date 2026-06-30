-- ============================================================
-- MemoVoy — V7: Domínio Sistema
-- notifications, audit_logs, feature_flags, trip_expenses
-- ============================================================

-- ------------------------------------------------------------
-- NOTIFICATIONS — persistência de notificações
-- ------------------------------------------------------------
CREATE TABLE notifications (
  id          UUID        PRIMARY KEY DEFAULT generate_ulid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(40) NOT NULL,
  title       VARCHAR(120) NOT NULL,
  body        TEXT,
  data        JSONB,
  channel     VARCHAR(20) NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending',
  read_at     TIMESTAMPTZ,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT notifications_type_chk CHECK (type IN (
    'like', 'comment', 'follow', 'follow_request',
    'challenge_complete', 'badge_earned',
    'geo_alert', 'day_summary', 'itinerary_ready',
    'session_suspicious', 'carbon_milestone', 'system'
  )),
  CONSTRAINT notifications_channel_chk CHECK (channel IN ('push', 'email', 'in_app')),
  CONSTRAINT notifications_status_chk  CHECK (status IN ('pending', 'sent', 'failed', 'read'))
);

COMMENT ON COLUMN notifications.data    IS 'Deep link payload: {type: "post", id: "..."}. App navega para o ecrã correto.';
COMMENT ON COLUMN notifications.type    IS 'session_suspicious: anomaly detection. carbon_milestone: badge de viagem verde.';

-- ------------------------------------------------------------
-- AUDIT_LOGS — registo imutável obrigatório por RGPD/LGPD
-- ------------------------------------------------------------
CREATE TABLE audit_logs (
  id          UUID        PRIMARY KEY DEFAULT generate_ulid(),
  actor_id    UUID,
  actor_type  VARCHAR(20) NOT NULL,
  action      VARCHAR(60) NOT NULL,
  target_type VARCHAR(30),
  target_id   UUID,
  ip_address  INET,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT audit_logs_actor_type_chk CHECK (actor_type IN ('user', 'admin', 'system'))
);

COMMENT ON TABLE audit_logs  IS 'Append-only por lei RGPD/LGPD. Trigger impede UPDATE e DELETE.';
COMMENT ON COLUMN audit_logs.action     IS 'Ex: user.data_export, user.account_delete, admin.content_remove.';
COMMENT ON COLUMN audit_logs.metadata  IS 'Contexto adicional. NUNCA incluir dados pessoais (PII).';
COMMENT ON COLUMN audit_logs.ip_address IS 'Tipo INET nativo do PostgreSQL — suporta IPv4 e IPv6.';

-- Trigger: proteger audit_logs de UPDATE e DELETE
CREATE OR REPLACE FUNCTION fn_protect_audit_logs()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs é append-only. UPDATE e DELETE não são permitidos por lei.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_logs_readonly
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION fn_protect_audit_logs();

-- ------------------------------------------------------------
-- FEATURE_FLAGS — gestão de flags sem deploy
-- ------------------------------------------------------------
CREATE TABLE feature_flags (
  id               UUID        PRIMARY KEY DEFAULT generate_ulid(),
  key              VARCHAR(80) NOT NULL,
  description      TEXT,
  is_enabled       BOOLEAN     NOT NULL DEFAULT false,
  rollout_percentage SMALLINT  NOT NULL DEFAULT 0,
  allowed_roles    TEXT[],
  allowed_regions  TEXT[],
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by       UUID        REFERENCES users(id),

  CONSTRAINT feature_flags_key_uq         UNIQUE (key),
  CONSTRAINT feature_flags_rollout_chk    CHECK (rollout_percentage BETWEEN 0 AND 100)
);

COMMENT ON COLUMN feature_flags.key              IS 'Ex: FEATURE_AI_ITINERARY. Uppercase snake_case.';
COMMENT ON COLUMN feature_flags.rollout_percentage IS '% de utilizadores que vê a feature (0=nenhum, 100=todos).';
COMMENT ON COLUMN feature_flags.allowed_regions  IS 'NULL=todas. ["eu-central-1"]=só EU.';

CREATE TRIGGER trg_feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed: feature flags do roadmap
INSERT INTO feature_flags (key, description, is_enabled, rollout_percentage) VALUES
  ('FEATURE_AI_ITINERARY',        'Geração de roteiros com IA — wizard 6 etapas',              false, 0),
  ('FEATURE_GEO_NOTIFICATIONS',   'Notificações contextuais por geolocalização',                false, 0),
  ('FEATURE_COLLAB_ITINERARY',    'Edição colaborativa em tempo real (v2.0)',                   false, 0),
  ('FEATURE_BOOKING_INTEGRATION', 'Integração Booking.com / Airbnb (v2.0)',                     false, 0),
  ('FEATURE_CARBON_CALCULATOR',   'Calculador de pegada de carbono por roteiro',                false, 0),
  ('FEATURE_CROWDING_PREDICTIONS','Previsão de affluência por local e hora',                    false, 0),
  ('FEATURE_EXPENSE_TRACKER',     'Registo de gastos reais durante a viagem',                   false, 0),
  ('FEATURE_PACKING_LIST',        'Packing list gerada por IA',                                 false, 0);

-- ------------------------------------------------------------
-- TRIP_EXPENSES — gastos reais durante a viagem
-- ------------------------------------------------------------
CREATE TABLE trip_expenses (
  id               UUID        PRIMARY KEY DEFAULT generate_ulid(),
  itinerary_id     UUID        NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents     INTEGER     NOT NULL,
  currency         CHAR(3)     NOT NULL,
  amount_eur_cents INTEGER,
  exchange_rate    NUMERIC(10,6),
  category         VARCHAR(30) NOT NULL,
  description      VARCHAR(200),
  day_id           UUID        REFERENCES itinerary_days(id) ON DELETE SET NULL,
  receipt_url      TEXT,
  spent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT trip_expenses_amount_chk   CHECK (amount_cents > 0),
  CONSTRAINT trip_expenses_eur_chk      CHECK (amount_eur_cents IS NULL OR amount_eur_cents > 0),
  CONSTRAINT trip_expenses_rate_chk     CHECK (exchange_rate IS NULL OR exchange_rate > 0),
  CONSTRAINT trip_expenses_category_chk CHECK (category IN (
    'food', 'transport', 'accommodation', 'activities', 'shopping', 'health', 'other'
  ))
);

COMMENT ON COLUMN trip_expenses.amount_cents     IS 'Sempre na moeda original — nunca converter antes de guardar.';
COMMENT ON COLUMN trip_expenses.currency         IS 'ISO 4217: EUR, JPY, USD, BRL, ...';
COMMENT ON COLUMN trip_expenses.amount_eur_cents IS 'Conversão para EUR no momento do registo (taxa BCE). Para totais.';
COMMENT ON COLUMN trip_expenses.exchange_rate    IS 'Taxa usada na conversão — guardada para auditoria.';

-- ============================================================
-- ÍNDICES — Domínio Sistema
-- ============================================================

-- Notificações não lidas de um utilizador
CREATE INDEX idx_notifications_user_unread
  ON notifications(user_id, created_at DESC)
  WHERE read_at IS NULL AND status = 'sent';

-- Audit logs por actor (compliance queries)
CREATE INDEX idx_audit_logs_actor
  ON audit_logs(actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;

-- Audit logs por alvo (ex: histórico de um utilizador)
CREATE INDEX idx_audit_logs_target
  ON audit_logs(target_id, target_type, created_at DESC)
  WHERE target_id IS NOT NULL;

-- Feature flags activas (lookup em cada request — cached em Redis)
CREATE UNIQUE INDEX idx_feature_flags_key
  ON feature_flags(key);

-- Gastos por roteiro (listagem e totais)
CREATE INDEX idx_trip_expenses_itinerary
  ON trip_expenses(itinerary_id, spent_at DESC);

-- Gastos por dia (breakdown diário)
CREATE INDEX idx_trip_expenses_day
  ON trip_expenses(day_id, spent_at DESC)
  WHERE day_id IS NOT NULL;
