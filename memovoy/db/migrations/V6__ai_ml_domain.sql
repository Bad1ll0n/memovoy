-- ============================================================
-- MemoVoy — V6: Domínio IA & ML
-- prompt_versions, ai_generations, itinerary_edits,
-- feed_interactions (TimescaleDB), packing_lists,
-- location_crowding_stats
-- ============================================================

-- ------------------------------------------------------------
-- PROMPT_VERSIONS — versões do system prompt para A/B testing
-- (criado antes de ai_generations por FK)
-- ------------------------------------------------------------
CREATE TABLE prompt_versions (
  id                  UUID        PRIMARY KEY DEFAULT generate_ulid(),
  version_name        VARCHAR(50) NOT NULL,
  system_prompt       TEXT        NOT NULL,
  traffic_percentage  SMALLINT    NOT NULL,
  is_active           BOOLEAN     NOT NULL DEFAULT true,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT prompt_versions_name_uq    UNIQUE (version_name),
  CONSTRAINT prompt_versions_pct_chk    CHECK (traffic_percentage BETWEEN 0 AND 100)
);

COMMENT ON COLUMN prompt_versions.system_prompt       IS 'Imutável após deploy. Criar nova versão para alterar.';
COMMENT ON COLUMN prompt_versions.traffic_percentage  IS 'Soma de todas as versões activas validada por trigger.';

-- Trigger: garantir que soma de traffic_percentage = 100 nas versões activas
CREATE OR REPLACE FUNCTION fn_validate_prompt_traffic()
RETURNS TRIGGER AS $$
DECLARE
  total_pct INTEGER;
BEGIN
  -- Soma todas as versões activas, excluindo a linha actual (para UPDATE)
  SELECT COALESCE(SUM(traffic_percentage), 0)
  INTO total_pct
  FROM prompt_versions
  WHERE is_active = true
    AND (
      -- Em UPDATE: excluir a linha que está a ser actualizada pelo seu ID real
      -- Em INSERT: NEW.id ainda não existe na tabela, então não precisa de exclusão
      TG_OP = 'INSERT' OR id != NEW.id
    );

  IF total_pct + NEW.traffic_percentage != 100 THEN
    RAISE EXCEPTION
      'A soma de traffic_percentage das versões activas deve ser 100. '
      'Soma actual (sem esta linha): %, a adicionar: %, total seria: %',
      total_pct, NEW.traffic_percentage, total_pct + NEW.traffic_percentage;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prompt_traffic_validate
  BEFORE INSERT OR UPDATE ON prompt_versions
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION fn_validate_prompt_traffic();

-- Seed: versão inicial do prompt (necessário para FK em ai_generations)
INSERT INTO prompt_versions (version_name, system_prompt, traffic_percentage, notes)
VALUES (
  'v1.0-baseline',
  'You are MemoVoy AI, an expert travel itinerary planner. Generate detailed, practical travel itineraries in JSON format based on the user wizard answers provided. Always validate distances between activities, check opening hours, and include practical warnings.',
  100,
  'Versão inicial — 100% do tráfego'
);

-- ------------------------------------------------------------
-- AI_GENERATIONS — log completo de cada geração de roteiro
-- ------------------------------------------------------------
CREATE TABLE ai_generations (
  id                  UUID        PRIMARY KEY DEFAULT generate_ulid(),
  user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  itinerary_id        UUID        REFERENCES itineraries(id) ON DELETE SET NULL,
  prompt_version_id   UUID        REFERENCES prompt_versions(id),
  wizard_answers      JSONB       NOT NULL,
  model_used          VARCHAR(50) NOT NULL,
  tokens_used         INTEGER,
  duration_ms         INTEGER,
  used_fallback       BOOLEAN     NOT NULL DEFAULT false,
  fallback_level      SMALLINT,
  user_rating         SMALLINT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ai_generations_tokens_chk    CHECK (tokens_used IS NULL OR tokens_used > 0),
  CONSTRAINT ai_generations_duration_chk  CHECK (duration_ms IS NULL OR duration_ms > 0),
  CONSTRAINT ai_generations_rating_chk    CHECK (user_rating IS NULL OR user_rating IN (1, 5)),
  CONSTRAINT ai_generations_fallback_chk  CHECK (fallback_level IS NULL OR fallback_level IN (1, 2, 3))
);

COMMENT ON COLUMN ai_generations.wizard_answers  IS 'Snapshot completo das respostas do wizard no momento da geração.';
COMMENT ON COLUMN ai_generations.fallback_level  IS '1=real-time, 2=cache Redis, 3=modo manual.';
COMMENT ON COLUMN ai_generations.user_rating     IS '1=thumbs down, 5=thumbs up. NULL até o utilizador avaliar.';

-- FK diferida: itineraries.ai_generation_id → ai_generations.id
-- Não é possível criar no V3 porque ai_generations não existia ainda.
ALTER TABLE itineraries
  ADD CONSTRAINT itineraries_ai_generation_id_fk
  FOREIGN KEY (ai_generation_id) REFERENCES ai_generations(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- ITINERARY_EDITS — feedback loop: o que o utilizador mudou
-- ------------------------------------------------------------
CREATE TABLE itinerary_edits (
  id                UUID        PRIMARY KEY DEFAULT generate_ulid(),
  generation_id     UUID        NOT NULL REFERENCES ai_generations(id) ON DELETE CASCADE,
  activity_id       UUID        REFERENCES itinerary_activities(id) ON DELETE SET NULL,
  edit_type         VARCHAR(20) NOT NULL,
  before_snapshot   JSONB,
  after_snapshot    JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT itinerary_edits_type_chk CHECK (
    edit_type IN ('remove', 'reorder', 'replace', 'add', 'edit_time', 'edit_notes')
  )
);

COMMENT ON TABLE itinerary_edits IS 'Dataset de treino mais valioso do MemoVoy — alimenta o feedback loop da IA.';
COMMENT ON COLUMN itinerary_edits.before_snapshot IS 'Estado da actividade antes da edição. NULL se edit_type=add.';
COMMENT ON COLUMN itinerary_edits.after_snapshot  IS 'Estado após. NULL se edit_type=remove.';

-- ------------------------------------------------------------
-- FEED_INTERACTIONS — impressões e interações (TimescaleDB)
-- ------------------------------------------------------------
CREATE TABLE feed_interactions (
  id                UUID        NOT NULL DEFAULT generate_ulid(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id           UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  interaction_type  VARCHAR(20) NOT NULL,
  dwell_ms          INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- PK composta com created_at: obrigatório para TimescaleDB hypertable
  -- e para replicação lógica funcionar correctamente com read replicas
  PRIMARY KEY (id, created_at),
  CONSTRAINT feed_interactions_type_chk  CHECK (interaction_type IN ('impression', 'like', 'comment', 'save', 'share', 'skip', 'report')),
  CONSTRAINT feed_interactions_dwell_chk CHECK (dwell_ms IS NULL OR dwell_ms >= 0)
);

COMMENT ON TABLE feed_interactions IS 'Maior tabela do sistema. TimescaleDB faz particionamento automático por semana.';
COMMENT ON COLUMN feed_interactions.dwell_ms IS 'Tempo em ms que o post ficou visível — sinal forte de interesse para ML.';

-- Converter em hypertable (TimescaleDB) — partição por semana
SELECT create_hypertable('feed_interactions', 'created_at',
  chunk_time_interval => INTERVAL '1 week',
  if_not_exists => TRUE
);

-- Compressão automática de chunks com mais de 90 dias
ALTER TABLE feed_interactions SET (
  timescaledb.compress,
  timescaledb.compress_orderby = 'created_at DESC',
  timescaledb.compress_segmentby = 'user_id'
);

SELECT add_compression_policy('feed_interactions', INTERVAL '90 days');

-- Índice para ML (por utilizador, dentro do chunk activo)
CREATE INDEX idx_feed_interactions_user
  ON feed_interactions(user_id, created_at DESC);

-- ------------------------------------------------------------
-- PACKING_LISTS — packing lists geradas pela IA
-- ------------------------------------------------------------
CREATE TABLE packing_lists (
  id                UUID        PRIMARY KEY DEFAULT generate_ulid(),
  itinerary_id      UUID        NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  items             JSONB       NOT NULL,
  weather_snapshot  JSONB,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_edited_at    TIMESTAMPTZ,

  CONSTRAINT packing_lists_itinerary_uq UNIQUE (itinerary_id)
);

COMMENT ON COLUMN packing_lists.items            IS '[{category, icon, items: [{item, reason, priority, checked}]}]';
COMMENT ON COLUMN packing_lists.weather_snapshot IS 'Previsão do tempo usada na geração — para regenerar se mudar.';
COMMENT ON COLUMN packing_lists.last_edited_at   IS 'NULL = não editada pelo utilizador.';

-- ------------------------------------------------------------
-- LOCATION_CROWDING_STATS — affluência por local e hora
-- ------------------------------------------------------------
CREATE TABLE location_crowding_stats (
  location_geo_hash VARCHAR(10)  NOT NULL,
  day_of_week       SMALLINT     NOT NULL,
  hour_of_day       SMALLINT     NOT NULL,
  location_name     VARCHAR(200),
  avg_visit_count   INTEGER      NOT NULL DEFAULT 0,
  sample_size       INTEGER      NOT NULL DEFAULT 0,
  crowding_level    VARCHAR(20),
  last_updated      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  PRIMARY KEY (location_geo_hash, day_of_week, hour_of_day),
  CONSTRAINT crowding_dow_chk     CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT crowding_hour_chk    CHECK (hour_of_day BETWEEN 0 AND 23),
  CONSTRAINT crowding_count_chk   CHECK (avg_visit_count >= 0),
  CONSTRAINT crowding_sample_chk  CHECK (sample_size >= 0),
  CONSTRAINT crowding_level_chk   CHECK (crowding_level IS NULL OR crowding_level IN ('low', 'medium', 'high', 'very_high'))
);

COMMENT ON COLUMN location_crowding_stats.location_geo_hash IS 'ST_GeoHash precisão 7 (~150m²). Agrupa locais próximos.';
COMMENT ON COLUMN location_crowding_stats.sample_size       IS 'Não mostrar dados ao utilizador se sample_size < 10.';

-- Trigger: calcular crowding_level automaticamente
CREATE OR REPLACE FUNCTION fn_update_crowding_level()
RETURNS TRIGGER AS $$
BEGIN
  NEW.crowding_level = CASE
    WHEN NEW.avg_visit_count = 0 THEN NULL
    WHEN NEW.avg_visit_count <= 5  THEN 'low'
    WHEN NEW.avg_visit_count <= 15 THEN 'medium'
    WHEN NEW.avg_visit_count <= 30 THEN 'high'
    ELSE 'very_high'
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crowding_level
  BEFORE INSERT OR UPDATE ON location_crowding_stats
  FOR EACH ROW EXECUTE FUNCTION fn_update_crowding_level();

-- ============================================================
-- ÍNDICES — Domínio IA
-- ============================================================

-- Feedback loop: edições por geração (análise de padrões)
CREATE INDEX idx_itinerary_edits_generation
  ON itinerary_edits(generation_id, edit_type, created_at);

-- Gerações por utilizador (histórico de roteiros IA)
CREATE INDEX idx_ai_generations_user
  ON ai_generations(user_id, created_at DESC);

-- Packing list por roteiro (já coberta pelo UNIQUE)

-- Crowding: lookup por geo_hash (principal query)
CREATE INDEX idx_crowding_geo_hash
  ON location_crowding_stats(location_geo_hash);
