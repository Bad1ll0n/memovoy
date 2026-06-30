-- ============================================================
-- MemoVoy — V3: Domínio Roteiros
-- itineraries, itinerary_days, itinerary_activities,
-- itinerary_collaborators, itinerary_carbon
-- ============================================================

-- ------------------------------------------------------------
-- ITINERARIES — cabeçalho do roteiro
-- ------------------------------------------------------------
CREATE TABLE itineraries (
  id                UUID            PRIMARY KEY DEFAULT generate_ulid(),
  user_id           UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title             VARCHAR(120)    NOT NULL,
  destination_name  VARCHAR(120)    NOT NULL,
  destination_geo   GEOGRAPHY(POINT, 4326),
  country_code      CHAR(2)         NOT NULL,
  start_date        DATE            NOT NULL,
  end_date          DATE            NOT NULL,
  duration_days     INTEGER         GENERATED ALWAYS AS (end_date - start_date + 1) STORED,
  group_type        VARCHAR(20)     NOT NULL,
  transport_modes   TEXT[],
  budget_per_day    INTEGER,
  travel_styles     TEXT[],
  visibility        VARCHAR(20)     NOT NULL DEFAULT 'public',
  status            VARCHAR(20)     NOT NULL DEFAULT 'draft',
  ai_generated      BOOLEAN         NOT NULL DEFAULT false,
  ai_generation_id  UUID,
  cover_image_url   TEXT,
  saves_count       INTEGER         NOT NULL DEFAULT 0,
  views_count       INTEGER         NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  published_at      TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,

  CONSTRAINT itineraries_dates_chk      CHECK (end_date >= start_date),
  CONSTRAINT itineraries_group_type_chk CHECK (group_type IN ('solo', 'couple', 'friends', 'family')),
  CONSTRAINT itineraries_visibility_chk CHECK (visibility IN ('public', 'followers', 'private')),
  CONSTRAINT itineraries_status_chk     CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT itineraries_saves_chk      CHECK (saves_count >= 0),
  CONSTRAINT itineraries_views_chk      CHECK (views_count >= 0),
  CONSTRAINT itineraries_budget_chk     CHECK (budget_per_day IS NULL OR budget_per_day > 0)
);

COMMENT ON COLUMN itineraries.duration_days     IS 'Calculado automaticamente: end_date - start_date + 1.';
COMMENT ON COLUMN itineraries.budget_per_day    IS 'Em EUR cents. Evitar floats para valores monetários.';
COMMENT ON COLUMN itineraries.ai_generation_id  IS 'FK para ai_generations — definida em V6 (domínio IA).';
COMMENT ON COLUMN itineraries.destination_geo   IS 'GEOGRAPHY(POINT, 4326) — cálculos em esfera, não plano.';

-- ------------------------------------------------------------
-- ITINERARY_DAYS — cada dia do roteiro
-- ------------------------------------------------------------
CREATE TABLE itinerary_days (
  id              UUID        PRIMARY KEY DEFAULT generate_ulid(),
  itinerary_id    UUID        NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  day_number      SMALLINT    NOT NULL,
  date            DATE        NOT NULL,
  theme           VARCHAR(100),
  notes           TEXT,
  total_distance_m INTEGER,

  CONSTRAINT itinerary_days_day_number_chk CHECK (day_number >= 1),
  CONSTRAINT itinerary_days_distance_chk   CHECK (total_distance_m IS NULL OR total_distance_m >= 0),
  CONSTRAINT itinerary_days_unique_day     UNIQUE (itinerary_id, day_number)
);

COMMENT ON CONSTRAINT itinerary_days_unique_day ON itinerary_days
  IS 'Garante que não existem dois dias com o mesmo número no mesmo roteiro.';

-- ------------------------------------------------------------
-- ITINERARY_ACTIVITIES — cada atividade de um dia
-- ------------------------------------------------------------
CREATE TABLE itinerary_activities (
  id              UUID        PRIMARY KEY DEFAULT generate_ulid(),
  day_id          UUID        NOT NULL REFERENCES itinerary_days(id) ON DELETE CASCADE,
  position        SMALLINT    NOT NULL,
  name            VARCHAR(200) NOT NULL,
  category        VARCHAR(30),
  location        GEOGRAPHY(POINT, 4326),
  address         TEXT,
  start_time      TIME,
  duration_minutes SMALLINT,
  notes           TEXT,
  booking_url     TEXT,
  price_estimate  INTEGER,
  ai_suggested    BOOLEAN     NOT NULL DEFAULT false,
  ai_warning      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,

  CONSTRAINT itinerary_activities_position_chk CHECK (position >= 1),
  CONSTRAINT itinerary_activities_category_chk CHECK (
    category IS NULL OR
    category IN ('attraction', 'restaurant', 'transport', 'hotel', 'activity', 'break')
  ),
  CONSTRAINT itinerary_activities_duration_chk CHECK (
    duration_minutes IS NULL OR duration_minutes > 0
  ),
  CONSTRAINT itinerary_activities_price_chk CHECK (
    price_estimate IS NULL OR price_estimate >= 0
  )
);

COMMENT ON COLUMN itinerary_activities.deleted_at IS 'Soft delete — usado pelo feedback loop da IA para ver o que foi removido.';
COMMENT ON COLUMN itinerary_activities.ai_warning IS 'Ex: "Fechado às segundas", "2h de carro do ponto anterior".';
COMMENT ON COLUMN itinerary_activities.price_estimate IS 'Em EUR cents.';

-- ------------------------------------------------------------
-- ITINERARY_COLLABORATORS — co-editores em tempo real
-- ------------------------------------------------------------
CREATE TABLE itinerary_collaborators (
  itinerary_id  UUID        NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          VARCHAR(20) NOT NULL DEFAULT 'editor',
  invited_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at   TIMESTAMPTZ,

  PRIMARY KEY (itinerary_id, user_id),
  CONSTRAINT itinerary_collaborators_role_chk CHECK (role IN ('editor', 'viewer'))
);

-- ------------------------------------------------------------
-- ITINERARY_CARBON — pegada de carbono por roteiro
-- ------------------------------------------------------------
CREATE TABLE itinerary_carbon (
  itinerary_id      UUID          PRIMARY KEY REFERENCES itineraries(id) ON DELETE CASCADE,
  total_kg_co2      NUMERIC(8,2)  NOT NULL,
  transport_kg      NUMERIC(8,2)  NOT NULL DEFAULT 0,
  accommodation_kg  NUMERIC(8,2)  NOT NULL DEFAULT 0,
  breakdown         JSONB,
  vs_avg_pct        NUMERIC(5,2),
  calculated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT itinerary_carbon_total_chk       CHECK (total_kg_co2 >= 0),
  CONSTRAINT itinerary_carbon_transport_chk   CHECK (transport_kg >= 0),
  CONSTRAINT itinerary_carbon_accom_chk       CHECK (accommodation_kg >= 0)
);

COMMENT ON COLUMN itinerary_carbon.vs_avg_pct IS 'Negativo = abaixo da média (melhor). Calculado vs média da comunidade para o mesmo destino.';
COMMENT ON COLUMN itinerary_carbon.breakdown  IS '[{mode, distance_km, kg_co2}]';

-- ============================================================
-- ÍNDICES — Domínio Roteiros
-- ============================================================

-- Feed de roteiros publicados por utilizador
CREATE INDEX idx_itineraries_user_published
  ON itineraries(user_id, published_at DESC)
  WHERE status = 'published' AND deleted_at IS NULL;

-- Top países do mês (homepage)
CREATE INDEX idx_itineraries_country_published
  ON itineraries(country_code, published_at DESC)
  WHERE status = 'published' AND deleted_at IS NULL;

-- Pesquisa geo: roteiros perto de uma localização
CREATE INDEX idx_itineraries_geo
  ON itineraries USING GIST(destination_geo)
  WHERE status = 'published' AND deleted_at IS NULL;

-- Pesquisa full-text por destino
CREATE INDEX idx_itineraries_destination_trgm
  ON itineraries USING GIN(destination_name gin_trgm_ops)
  WHERE status = 'published' AND deleted_at IS NULL;

-- Atividades de um dia ordenadas por posição
CREATE INDEX idx_activities_day_position
  ON itinerary_activities(day_id, position)
  WHERE deleted_at IS NULL;

-- Atividades por localização (geo challenges)
CREATE INDEX idx_activities_location
  ON itinerary_activities USING GIST(location)
  WHERE deleted_at IS NULL;

-- ============================================================
-- TRIGGERS — Contadores de saves e trips
-- ============================================================

-- saves_count em itineraries (trigger definido após tabela saves em V4)

-- total_trips e countries_visited quando roteiro é publicado
CREATE OR REPLACE FUNCTION fn_update_trip_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.status != 'published'
    AND NEW.status = 'published'
    AND NEW.deleted_at IS NULL
  THEN
    UPDATE user_profiles
    SET
      total_trips = total_trips + 1,
      countries_visited = CASE
        WHEN NEW.country_code = ANY(COALESCE(countries_visited, ARRAY[]::CHAR(2)[]))
          THEN countries_visited
          ELSE array_append(COALESCE(countries_visited, ARRAY[]::CHAR(2)[]), NEW.country_code)
        END,
      total_countries = array_length(
        CASE
          WHEN NEW.country_code = ANY(COALESCE(countries_visited, ARRAY[]::CHAR(2)[]))
            THEN countries_visited
            ELSE array_append(COALESCE(countries_visited, ARRAY[]::CHAR(2)[]), NEW.country_code)
          END,
        1
      )
    WHERE user_id = NEW.user_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_trip_stats
  AFTER UPDATE ON itineraries
  FOR EACH ROW EXECUTE FUNCTION fn_update_trip_stats();
