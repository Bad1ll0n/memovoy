-- ============================================================
-- MemoVoy — V8: Views, funções utilitárias e jobs periódicos
-- ============================================================

-- ------------------------------------------------------------
-- VIEW: top_countries_month
-- Top 3 países mais viajados no mês atual (homepage)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW top_countries_month AS
SELECT
  i.country_code,
  COUNT(*)                    AS trip_count,
  COUNT(DISTINCT i.user_id)   AS unique_travelers,
  DATE_TRUNC('month', NOW())  AS period
FROM itineraries i
WHERE
  i.status = 'published'
  AND i.deleted_at IS NULL
  AND i.published_at >= DATE_TRUNC('month', NOW())
  AND i.published_at <  DATE_TRUNC('month', NOW()) + INTERVAL '1 month'
GROUP BY i.country_code
ORDER BY trip_count DESC
LIMIT 10;

COMMENT ON VIEW top_countries_month IS 'Top países do mês para a homepage. Resultado cached em Redis TTL 1h.';

-- ------------------------------------------------------------
-- VIEW: user_feed_base
-- Base do feed por utilizador (fan-out on write já em Redis,
-- esta view é usada apenas como fallback ou para creators)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW user_stats AS
SELECT
  u.id                          AS user_id,
  u.username,
  up.display_name,
  up.avatar_url,
  up.level,
  u.follower_count,
  up.following_count,
  up.total_trips,
  up.total_countries,
  up.countries_visited,
  s.current_streak,
  s.longest_streak,
  COUNT(DISTINCT ub.badge_id)   AS badge_count
FROM users u
JOIN user_profiles up ON up.user_id = u.id
LEFT JOIN streaks s   ON s.user_id = u.id
LEFT JOIN user_badges ub ON ub.user_id = u.id
WHERE u.deleted_at IS NULL
GROUP BY u.id, up.user_id, s.user_id;

COMMENT ON VIEW user_stats IS 'Perfil completo com stats. Usado no ecrã de perfil público.';

-- ------------------------------------------------------------
-- VIEW: itinerary_summary
-- Roteiro com dados agrupados para o feed e pesquisa
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW itinerary_summary AS
SELECT
  i.id,
  i.user_id,
  i.title,
  i.destination_name,
  i.country_code,
  i.start_date,
  i.end_date,
  i.duration_days,
  i.group_type,
  i.transport_modes,
  i.travel_styles,
  i.visibility,
  i.ai_generated,
  i.cover_image_url,
  i.saves_count,
  i.views_count,
  i.published_at,
  up.display_name   AS author_name,
  up.avatar_url     AS author_avatar,
  ic.total_kg_co2,
  ic.vs_avg_pct     AS carbon_vs_avg_pct,
  COUNT(DISTINCT id.id)  AS days_count,
  COUNT(DISTINCT ia.id)  AS activities_count
FROM itineraries i
JOIN user_profiles up       ON up.user_id = i.user_id
LEFT JOIN itinerary_carbon ic ON ic.itinerary_id = i.id
LEFT JOIN itinerary_days id   ON id.itinerary_id = i.id
LEFT JOIN itinerary_activities ia ON ia.day_id = id.id AND ia.deleted_at IS NULL
WHERE i.status = 'published'
  AND i.deleted_at IS NULL
GROUP BY i.id, up.user_id, ic.itinerary_id;

COMMENT ON VIEW itinerary_summary IS 'Usado no feed e pesquisa. Inclui carbono se calculado.';

-- ------------------------------------------------------------
-- FUNÇÃO: calculate_itinerary_carbon
-- Calcula e guarda a pegada de carbono de um roteiro
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_and_save_carbon(p_itinerary_id UUID)
RETURNS VOID AS $$
DECLARE
  v_transport_kg  NUMERIC(8,2);
  v_accom_kg      NUMERIC(8,2);
  v_total_kg      NUMERIC(8,2);
  v_avg_kg        NUMERIC(8,2);
  v_vs_avg        NUMERIC(5,2);
BEGIN
  -- Emissões de transporte (baseadas nos modos declarados no wizard)
  -- Nota: distâncias calculadas via PostGIS nas atividades
  SELECT COALESCE(SUM(
    CASE
      WHEN tm = 'car'     THEN ST_Distance(a1.location, a2.location) / 1000.0 * 0.120
      WHEN tm = 'train'   THEN ST_Distance(a1.location, a2.location) / 1000.0 * 0.014
      WHEN tm = 'bus'     THEN ST_Distance(a1.location, a2.location) / 1000.0 * 0.068
      WHEN tm = 'taxi'    THEN ST_Distance(a1.location, a2.location) / 1000.0 * 0.150
      ELSE 0  -- walking, bicycle
    END
  ), 0)
  INTO v_transport_kg
  FROM itinerary_activities a1
  JOIN itinerary_activities a2
    ON a2.day_id = a1.day_id AND a2.position = a1.position + 1
  JOIN itinerary_days d ON d.id = a1.day_id
  JOIN itineraries i    ON i.id = d.itinerary_id,
  UNNEST(i.transport_modes) AS tm
  WHERE d.itinerary_id = p_itinerary_id
    AND a1.location IS NOT NULL
    AND a2.location IS NOT NULL;

  -- Emissões de alojamento
  SELECT
    i.duration_days * CASE i.group_type
      WHEN 'family'  THEN 30000  -- família → hotel maior
      ELSE 15000                 -- default médio (g CO₂/noite)
    END / 1000.0
  INTO v_accom_kg
  FROM itineraries i
  WHERE i.id = p_itinerary_id;

  v_total_kg := COALESCE(v_transport_kg, 0) + COALESCE(v_accom_kg, 0);

  -- Média da comunidade para o mesmo destino (últimos 6 meses)
  SELECT AVG(ic2.total_kg_co2)
  INTO v_avg_kg
  FROM itinerary_carbon ic2
  JOIN itineraries i2 ON i2.id = ic2.itinerary_id
  JOIN itineraries i_ref ON i_ref.id = p_itinerary_id
  WHERE i2.country_code = i_ref.country_code
    AND i2.id != p_itinerary_id
    AND ic2.calculated_at > NOW() - INTERVAL '6 months';

  IF v_avg_kg IS NOT NULL AND v_avg_kg > 0 THEN
    v_vs_avg := ROUND(((v_total_kg - v_avg_kg) / v_avg_kg) * 100, 2);
  END IF;

  -- Guardar ou actualizar
  INSERT INTO itinerary_carbon (
    itinerary_id, total_kg_co2, transport_kg, accommodation_kg, vs_avg_pct, calculated_at
  ) VALUES (
    p_itinerary_id, v_total_kg, COALESCE(v_transport_kg, 0), COALESCE(v_accom_kg, 0), v_vs_avg, NOW()
  )
  ON CONFLICT (itinerary_id) DO UPDATE SET
    total_kg_co2     = EXCLUDED.total_kg_co2,
    transport_kg     = EXCLUDED.transport_kg,
    accommodation_kg = EXCLUDED.accommodation_kg,
    vs_avg_pct       = EXCLUDED.vs_avg_pct,
    calculated_at    = NOW();

END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_and_save_carbon IS 'Chamada após publicação de roteiro. Recalcula se o roteiro for editado.';

-- ------------------------------------------------------------
-- FUNÇÃO: get_crowding_for_activity
-- Retorna previsão de affluência para uma actividade
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_crowding_for_activity(
  p_location    GEOGRAPHY(POINT, 4326),
  p_start_time  TIME,
  p_date        DATE
)
RETURNS TABLE (
  crowding_level  VARCHAR(20),
  avg_visit_count INTEGER,
  sample_size     INTEGER,
  best_hours      INTEGER[]
) AS $$
DECLARE
  v_geo_hash    VARCHAR(10);
  v_dow         SMALLINT;
  v_hour        SMALLINT;
BEGIN
  v_geo_hash := ST_GeoHash(p_location, 7);
  v_dow      := EXTRACT(DOW FROM p_date)::SMALLINT;
  v_hour     := EXTRACT(HOUR FROM p_start_time)::SMALLINT;

  RETURN QUERY
  WITH current_slot AS (
    SELECT
      lcs.crowding_level,
      lcs.avg_visit_count,
      lcs.sample_size
    FROM location_crowding_stats lcs
    WHERE lcs.location_geo_hash = v_geo_hash
      AND lcs.day_of_week = v_dow
      AND lcs.hour_of_day = v_hour
      AND lcs.sample_size >= 10  -- não devolver dados insuficientes
  ),
  best_hours_calc AS (
    SELECT ARRAY_AGG(lcs.hour_of_day ORDER BY lcs.avg_visit_count ASC) AS hours
    FROM location_crowding_stats lcs
    WHERE lcs.location_geo_hash = v_geo_hash
      AND lcs.day_of_week = v_dow
      AND lcs.sample_size >= 10
    LIMIT 3
  )
  SELECT
    cs.crowding_level,
    cs.avg_visit_count,
    cs.sample_size,
    bh.hours
  FROM current_slot cs, best_hours_calc bh;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- FUNÇÃO: aggregate_crowding_stats
-- Job diário — agrega dados de roteiros para crowding stats
-- Deve ser executada via pg_cron ou job externo (Kafka consumer)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION aggregate_crowding_stats()
RETURNS INTEGER AS $$
DECLARE
  rows_updated INTEGER;
BEGIN
  INSERT INTO location_crowding_stats (
    location_geo_hash,
    day_of_week,
    hour_of_day,
    location_name,
    avg_visit_count,
    sample_size,
    last_updated
  )
  SELECT
    ST_GeoHash(a.location, 7)                               AS geo_hash,
    EXTRACT(DOW FROM i.start_date + (d.day_number - 1))::SMALLINT AS dow,
    EXTRACT(HOUR FROM a.start_time)::SMALLINT               AS hour,
    MODE() WITHIN GROUP (ORDER BY a.name)                   AS location_name,
    COUNT(*)::INTEGER                                       AS visit_count,
    COUNT(*)::INTEGER                                       AS sample_size,
    NOW()
  FROM itinerary_activities a
  JOIN itinerary_days d       ON d.id = a.day_id
  JOIN itineraries i          ON i.id = d.itinerary_id
  WHERE
    a.location IS NOT NULL
    AND a.start_time IS NOT NULL
    AND i.status = 'published'
    AND a.deleted_at IS NULL
    AND i.deleted_at IS NULL
  GROUP BY geo_hash, dow, hour
  ON CONFLICT (location_geo_hash, day_of_week, hour_of_day)
  DO UPDATE SET
    avg_visit_count = EXCLUDED.avg_visit_count,
    sample_size     = EXCLUDED.sample_size,
    location_name   = EXCLUDED.location_name,
    last_updated    = NOW();

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION aggregate_crowding_stats IS 'Executar diariamente às 3h UTC via cron job ou Kafka consumer.';

-- ------------------------------------------------------------
-- FUNÇÃO: check_feature_flag
-- Verifica se uma feature está activa para um utilizador
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_feature_flag(
  p_flag_key    VARCHAR(80),
  p_user_id     UUID,
  p_user_role   VARCHAR(20),
  p_db_region   VARCHAR(20)
)
RETURNS BOOLEAN AS $$
DECLARE
  v_flag feature_flags%ROWTYPE;
  v_hash INTEGER;
BEGIN
  SELECT * INTO v_flag
  FROM feature_flags
  WHERE key = p_flag_key AND is_enabled = true;

  -- Flag não existe ou está desligada
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Verificar role
  IF v_flag.allowed_roles IS NOT NULL
    AND NOT (p_user_role = ANY(v_flag.allowed_roles))
  THEN
    RETURN false;
  END IF;

  -- Verificar região
  IF v_flag.allowed_regions IS NOT NULL
    AND NOT (p_db_region = ANY(v_flag.allowed_regions))
  THEN
    RETURN false;
  END IF;

  -- Verificar rollout percentage (determinístico por user_id)
  IF v_flag.rollout_percentage < 100 THEN
    v_hash := ABS(HASHTEXT(p_user_id::TEXT || p_flag_key)) % 100;
    IF v_hash >= v_flag.rollout_percentage THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION check_feature_flag IS 'Rollout determinístico por user_id — mesmo user vê sempre o mesmo resultado.';
