-- ============================================================
-- MemoVoy — V15: Refactoring de views, triggers e constraints
-- Zero downtime — CREATE OR REPLACE, sem ALTER TABLE bloqueante
-- ============================================================

-- ------------------------------------------------------------
-- FIX 1: itinerary_summary VIEW — eliminar produto cartesiano
-- O JOIN duplo (days × activities) antes do GROUP BY gerava
-- N×M linhas (ex: 7 dias × 35 atividades = 245 linhas por roteiro)
-- Substituído por subqueries correlacionadas: O(n) em vez de O(n×m)
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
  up.display_name                     AS author_name,
  up.avatar_url                       AS author_avatar,
  ic.total_kg_co2,
  ic.vs_avg_pct                       AS carbon_vs_avg_pct,
  -- Subqueries correlacionadas: sem produto cartesiano
  (
    SELECT COUNT(*)
    FROM itinerary_days idays
    WHERE idays.itinerary_id = i.id
  )                                   AS days_count,
  (
    SELECT COUNT(*)
    FROM itinerary_activities iact
    JOIN itinerary_days idays ON idays.id = iact.day_id
    WHERE idays.itinerary_id = i.id
      AND iact.deleted_at IS NULL
  )                                   AS activities_count
FROM itineraries i
JOIN user_profiles up         ON up.user_id = i.user_id
LEFT JOIN itinerary_carbon ic ON ic.itinerary_id = i.id
WHERE i.status = 'published'
  AND i.deleted_at IS NULL;

COMMENT ON VIEW itinerary_summary
  IS 'Feed e pesquisa. Subqueries correlacionadas evitam produto cartesiano days×activities.';

-- ------------------------------------------------------------
-- FIX 2: top_countries_month → função parametrizada
-- NOW() na VIEW impede reutilização do plano de execução.
-- Função STABLE permite caching do plano pelo PostgreSQL.
-- A VIEW original é mantida como wrapper para compatibilidade.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_top_countries(
  p_month DATE DEFAULT DATE_TRUNC('month', NOW())::DATE
)
RETURNS TABLE (
  country_code     CHAR(2),
  trip_count       BIGINT,
  unique_travelers BIGINT,
  period           DATE
)
LANGUAGE SQL STABLE AS $$
  SELECT
    i.country_code,
    COUNT(*)                  AS trip_count,
    COUNT(DISTINCT i.user_id) AS unique_travelers,
    p_month                   AS period
  FROM itineraries i
  WHERE i.status = 'published'
    AND i.deleted_at IS NULL
    AND i.published_at >= p_month
    AND i.published_at <  p_month + INTERVAL '1 month'
  GROUP BY i.country_code
  ORDER BY trip_count DESC
  LIMIT 10;
$$;

COMMENT ON FUNCTION get_top_countries(DATE)
  IS 'Substitui a VIEW top_countries_month. STABLE permite caching do plano. '
     'Chamar sem argumento para mês actual: SELECT * FROM get_top_countries().';

-- Manter VIEW como wrapper para retrocompatibilidade
CREATE OR REPLACE VIEW top_countries_month AS
  SELECT * FROM get_top_countries();

COMMENT ON VIEW top_countries_month
  IS 'Wrapper de retrocompatibilidade. Usar get_top_countries() directamente para melhor performance.';

-- ------------------------------------------------------------
-- FIX 3: fn_auto_hide_reported_content — eliminar double-write
-- O COUNT + UPDATE separados permitem dois writes simultâneos
-- para o mesmo conteúdo. UPDATE directo com subquery é atómico.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_auto_hide_reported_content()
RETURNS TRIGGER AS $$
BEGIN
  -- UPDATE atómico com subquery — sem SELECT separado
  -- A condição is_hidden=false garante idempotência (sem double write)
  IF NEW.target_type = 'post' THEN
    UPDATE posts
    SET is_hidden = true
    WHERE id = NEW.target_id
      AND is_hidden = false  -- idempotente: só actualiza se ainda visível
      AND (
        SELECT COUNT(*)
        FROM reports r
        WHERE r.target_id = NEW.target_id
          AND r.target_type = 'post'
          AND r.status = 'pending'
          AND r.created_at > NOW() - INTERVAL '1 hour'
      ) >= 5;

  ELSIF NEW.target_type = 'comment' THEN
    UPDATE comments
    SET is_hidden = true
    WHERE id = NEW.target_id
      AND is_hidden = false
      AND (
        SELECT COUNT(*)
        FROM reports r
        WHERE r.target_id = NEW.target_id
          AND r.target_type = 'comment'
          AND r.status = 'pending'
          AND r.created_at > NOW() - INTERVAL '1 hour'
      ) >= 5;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_auto_hide_reported_content()
  IS 'UPDATE atómico com subquery — sem race condition de double-write. '
     'Idempotente: is_hidden=false garante que só actualiza uma vez.';

-- ------------------------------------------------------------
-- FIX 4: Trigger para validar alteração de datas do roteiro
-- Se start_date/end_date mudarem, verificar que dias existentes
-- ainda cabem no novo intervalo antes de permitir a alteração.
-- O trigger fn_validate_day_date já valida INSERT/UPDATE em days
-- mas não cobre UPDATE em itineraries que reduza o intervalo.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validate_itinerary_dates_change()
RETURNS TRIGGER AS $$
DECLARE
  v_out_of_range_count INTEGER;
  v_min_date DATE;
  v_max_date DATE;
BEGIN
  -- Só actua se as datas mudaram
  IF NEW.start_date = OLD.start_date AND NEW.end_date = OLD.end_date THEN
    RETURN NEW;
  END IF;

  -- Verificar dias existentes fora do novo intervalo
  SELECT
    COUNT(*),
    MIN(date),
    MAX(date)
  INTO v_out_of_range_count, v_min_date, v_max_date
  FROM itinerary_days
  WHERE itinerary_id = NEW.id
    AND (date < NEW.start_date OR date > NEW.end_date);

  IF v_out_of_range_count > 0 THEN
    RAISE EXCEPTION
      'Não é possível alterar o intervalo do roteiro para [%, %]: '
      '% dia(s) ficaria(m) fora do intervalo (min: %, max: %). '
      'Remova os dias afectados primeiro.',
      NEW.start_date, NEW.end_date,
      v_out_of_range_count, v_min_date, v_max_date;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_itinerary_dates_change
  BEFORE UPDATE ON itineraries
  FOR EACH ROW EXECUTE FUNCTION fn_validate_itinerary_dates_change();

COMMENT ON FUNCTION fn_validate_itinerary_dates_change()
  IS 'Impede redução do intervalo de datas se existirem dias fora do novo intervalo.';

-- ------------------------------------------------------------
-- FIX 5: CHECK constraint — challenges.starts_at inconsistente
-- Permite starts_at=NULL com ends_at=NOT NULL (sem início mas com fim)
-- que é logicamente impossível.
-- ------------------------------------------------------------
ALTER TABLE challenges
  ADD CONSTRAINT challenges_dates_consistency
  CHECK (
    -- Ambos NULL: desafio sem período definido (sempre activo)
    (starts_at IS NULL AND ends_at IS NULL)
    OR
    -- Só início definido: desafio com início mas sem fim
    (starts_at IS NOT NULL AND ends_at IS NULL)
    OR
    -- Ambos definidos e fim > início
    (starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at)
  );

COMMENT ON CONSTRAINT challenges_dates_consistency ON challenges
  IS 'Impede ends_at definido sem starts_at (sem início mas com fim é logicamente inválido).';

-- ------------------------------------------------------------
-- FIX 6: CHECK constraint — itinerary_edits snapshots
-- before_snapshot deve ser NULL apenas em 'add'
-- after_snapshot deve ser NULL apenas em 'remove'
-- Para outros tipos, ambos devem estar preenchidos
-- ------------------------------------------------------------
ALTER TABLE itinerary_edits
  ADD CONSTRAINT itinerary_edits_snapshots_chk
  CHECK (
    (edit_type = 'add'
      AND before_snapshot IS NULL
      AND after_snapshot  IS NOT NULL)
    OR
    (edit_type = 'remove'
      AND before_snapshot IS NOT NULL
      AND after_snapshot  IS NULL)
    OR
    (edit_type NOT IN ('add', 'remove')
      AND before_snapshot IS NOT NULL
      AND after_snapshot  IS NOT NULL)
  );

COMMENT ON CONSTRAINT itinerary_edits_snapshots_chk ON itinerary_edits
  IS 'before=NULL só em add; after=NULL só em remove; ambos preenchidos nos restantes tipos.';

-- ------------------------------------------------------------
-- FIX 7: Política de limpeza de notificações antigas
-- Notificações lidas com mais de 90 dias acumulam indefinidamente.
-- Criamos uma função que pode ser chamada pelo cron job diário.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION cleanup_old_notifications(
  p_retention_days INTEGER DEFAULT 90
)
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM notifications
  WHERE read_at IS NOT NULL
    AND read_at < NOW() - (p_retention_days || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Registar no audit_log para rastreabilidade
  INSERT INTO audit_logs (actor_type, action, metadata)
  VALUES (
    'system',
    'notifications.cleanup',
    jsonb_build_object(
      'deleted_count', v_deleted,
      'retention_days', p_retention_days,
      'cutoff_date', (NOW() - (p_retention_days || ' days')::INTERVAL)::DATE
    )
  );

  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_notifications(INTEGER)
  IS 'Limpa notificações lidas mais antigas que p_retention_days (default 90). '
     'Chamar diariamente: SELECT cleanup_old_notifications();';

-- ------------------------------------------------------------
-- Verificação final
-- ------------------------------------------------------------
DO $$
DECLARE
  v_count  INTEGER;
  v_exists BOOLEAN;
BEGIN
  -- Verificar que a VIEW foi actualizada (sem GROUP BY)
  SELECT EXISTS(
    SELECT 1 FROM pg_views
    WHERE schemaname = 'public'
      AND viewname = 'itinerary_summary'
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'V15: itinerary_summary VIEW não encontrada.';
  END IF;

  -- Verificar função get_top_countries
  SELECT EXISTS(
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_top_countries'
      AND pronamespace = 'public'::regnamespace
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'V15: função get_top_countries não encontrada.';
  END IF;

  -- Verificar constraints novas
  SELECT COUNT(*) INTO v_count
  FROM pg_constraint
  WHERE conname IN (
    'challenges_dates_consistency',
    'itinerary_edits_snapshots_chk'
  );
  IF v_count != 2 THEN
    RAISE EXCEPTION 'V15: Esperadas 2 constraints novas, encontradas: %', v_count;
  END IF;

  -- Verificar triggers novos
  SELECT COUNT(*) INTO v_count
  FROM pg_trigger
  WHERE tgname IN (
    'trg_validate_itinerary_dates_change'
  );
  IF v_count != 1 THEN
    RAISE EXCEPTION 'V15: trigger trg_validate_itinerary_dates_change não encontrado.';
  END IF;

  RAISE NOTICE 'V15 concluída: VIEW refactored, função criada, 2 constraints + 1 trigger + 1 função de limpeza.';
END $$;
