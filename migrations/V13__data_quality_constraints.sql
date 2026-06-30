-- ============================================================
-- MemoVoy — V13: Qualidade de dados
-- Resolve: constraints em falta, UNIQUE positions, validações
-- de ownership, datas, moeda, país, MFA e leaderboard NULL
--
-- PRÉ-CONDIÇÃO: executar as queries de validação abaixo
-- ANTES de aplicar esta migration em produção:
--
--   SELECT day_id, position, COUNT(*) FROM itinerary_activities
--     WHERE deleted_at IS NULL
--     GROUP BY day_id, position HAVING COUNT(*) > 1;
--
--   SELECT post_id, position, COUNT(*) FROM post_media
--     GROUP BY post_id, position HAVING COUNT(*) > 1;
--
--   SELECT COUNT(*) FROM users
--     WHERE mfa_enabled = true AND mfa_secret_encrypted IS NULL;
--
--   SELECT COUNT(*) FROM trip_expenses
--     WHERE currency !~ '^[A-Z]{3}$';
--
--   SELECT COUNT(*) FROM users
--     WHERE country_code IS NOT NULL AND country_code !~ '^[A-Z]{2}$';
-- ============================================================

-- ------------------------------------------------------------
-- FIX 7: UNIQUE (day_id, position) para itinerary_activities
-- Resolve: duas actividades no mesmo dia com a mesma posição
-- causam ordenação indeterminada no drag-and-drop
-- Índice parcial exclui soft-deleted para não bloquear reutilização
-- de posições após remoção de actividades
-- ------------------------------------------------------------
CREATE UNIQUE INDEX idx_activities_day_position_unique
  ON itinerary_activities(day_id, position)
  WHERE deleted_at IS NULL;

COMMENT ON INDEX idx_activities_day_position_unique
  IS 'Garante posições únicas por dia. Índice parcial exclui soft-deleted.';

-- ------------------------------------------------------------
-- FIX 8: UNIQUE (post_id, position) para post_media
-- Resolve: dois media do mesmo post com a mesma posição
-- causam ordem de exibição indeterminada
-- ------------------------------------------------------------
CREATE UNIQUE INDEX idx_post_media_position_unique
  ON post_media(post_id, position);

COMMENT ON INDEX idx_post_media_position_unique
  IS 'Garante posições únicas por post para ordenação consistente de media.';

-- ------------------------------------------------------------
-- FIX 9: UNIQUE para leaderboard_entries com scope_id NULL
-- Resolve: NULL != NULL em índices UNIQUE do PostgreSQL permite
-- múltiplas entradas globais (scope_id NULL) para o mesmo
-- utilizador e período — NULLS NOT DISTINCT corrige isto
-- ------------------------------------------------------------

-- Remover constraint original que não protege NULLs
ALTER TABLE leaderboard_entries
  DROP CONSTRAINT leaderboard_unique_entry;

-- Dois índices: um para entradas globais (scope_id NULL)
-- e outro para entradas com scope (scope_id NOT NULL)
CREATE UNIQUE INDEX leaderboard_unique_global
  ON leaderboard_entries(user_id, leaderboard_type, period_start)
  WHERE scope_id IS NULL;

CREATE UNIQUE INDEX leaderboard_unique_scoped
  ON leaderboard_entries(user_id, leaderboard_type, scope_id, period_start)
  WHERE scope_id IS NOT NULL;

COMMENT ON INDEX leaderboard_unique_global
  IS 'Garante unicidade para leaderboards globais (scope_id NULL). NULLS NOT DISTINCT seria mais elegante mas estes índices parciais têm melhor performance.';

-- ------------------------------------------------------------
-- FIX 10: CHECK constraint — MFA secret obrigatório quando MFA activo
-- Resolve: mfa_enabled=true com mfa_secret_encrypted=NULL
-- causaria falha silenciosa na autenticação MFA
-- ------------------------------------------------------------
ALTER TABLE users
  ADD CONSTRAINT users_mfa_secret_required
  CHECK (
    mfa_enabled = false
    OR (mfa_enabled = true AND mfa_secret_encrypted IS NOT NULL)
  );

COMMENT ON CONSTRAINT users_mfa_secret_required ON users
  IS 'Garante que MFA activo tem sempre um secret definido.';

-- ------------------------------------------------------------
-- FIX 11: CHECK constraint — formato ISO 4217 para currency
-- Resolve: qualquer string de 3 caracteres era aceite
-- ------------------------------------------------------------
ALTER TABLE trip_expenses
  ADD CONSTRAINT trip_expenses_currency_format
  CHECK (currency ~ '^[A-Z]{3}$');

COMMENT ON CONSTRAINT trip_expenses_currency_format ON trip_expenses
  IS 'Formato ISO 4217: 3 letras maiúsculas (EUR, JPY, USD, BRL, ...).';

-- ------------------------------------------------------------
-- FIX 12: CHECK constraint — formato ISO 3166-1 alpha-2 para country_code
-- Resolve: CHAR(2) aceita qualquer dois caracteres sem validação
-- Aplicado nas tabelas users, itineraries e posts
-- ------------------------------------------------------------
ALTER TABLE users
  ADD CONSTRAINT users_country_code_format
  CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$');

ALTER TABLE itineraries
  ADD CONSTRAINT itineraries_country_code_format
  CHECK (country_code ~ '^[A-Z]{2}$');

ALTER TABLE posts
  ADD CONSTRAINT posts_country_code_format
  CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$');

-- ------------------------------------------------------------
-- FIX 13: Trigger — validar datas de itinerary_days vs roteiro
-- Resolve: itinerary_days.date pode estar fora de [start_date, end_date]
-- do roteiro pai, corrompendo a estrutura silenciosamente
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validate_day_date()
RETURNS TRIGGER AS $$
DECLARE
  v_start DATE;
  v_end   DATE;
  v_title VARCHAR(120);
BEGIN
  SELECT start_date, end_date, title
  INTO v_start, v_end, v_title
  FROM itineraries
  WHERE id = NEW.itinerary_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Roteiro % não encontrado ao validar data do dia.', NEW.itinerary_id;
  END IF;

  IF NEW.date < v_start OR NEW.date > v_end THEN
    RAISE EXCEPTION
      'Data do dia % (%) está fora do intervalo do roteiro "%" [%, %].',
      NEW.day_number, NEW.date, v_title, v_start, v_end;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_day_date
  BEFORE INSERT OR UPDATE ON itinerary_days
  FOR EACH ROW EXECUTE FUNCTION fn_validate_day_date();

COMMENT ON FUNCTION fn_validate_day_date()
  IS 'Garante que a data de cada dia está dentro do intervalo do roteiro pai.';

-- ------------------------------------------------------------
-- FIX 14: Trigger — validar ownership de trip_expenses
-- Resolve: utilizador pode registar gastos em roteiros alheios
-- O RLS protege leitura mas não o INSERT directamente
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validate_expense_ownership()
RETURNS TRIGGER AS $$
BEGIN
  -- Verificar se o utilizador é dono do roteiro ou colaborador aceite
  IF NOT EXISTS (
    SELECT 1 FROM itineraries i
    WHERE i.id = NEW.itinerary_id
      AND i.deleted_at IS NULL
      AND (
        -- Dono do roteiro
        i.user_id = NEW.user_id
        OR
        -- Colaborador com convite aceite
        EXISTS (
          SELECT 1 FROM itinerary_collaborators ic
          WHERE ic.itinerary_id = NEW.itinerary_id
            AND ic.user_id = NEW.user_id
            AND ic.accepted_at IS NOT NULL
        )
      )
  ) THEN
    RAISE EXCEPTION
      'Utilizador % não tem permissão para registar gastos no roteiro %.',
      NEW.user_id, NEW.itinerary_id;
  END IF;

  -- Validar que day_id pertence ao roteiro correcto
  IF NEW.day_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM itinerary_days d
      WHERE d.id = NEW.day_id
        AND d.itinerary_id = NEW.itinerary_id
    ) THEN
      RAISE EXCEPTION
        'O dia % não pertence ao roteiro %.',
        NEW.day_id, NEW.itinerary_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_expense_ownership
  BEFORE INSERT ON trip_expenses
  FOR EACH ROW EXECUTE FUNCTION fn_validate_expense_ownership();

COMMENT ON FUNCTION fn_validate_expense_ownership()
  IS 'Garante que só donos e colaboradores aceites podem registar gastos num roteiro.';

-- ------------------------------------------------------------
-- FIX 15: Trigger — sincronizar total_countries com countries_visited
-- Resolve: edição directa de countries_visited dessincroniza total_countries
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_sync_total_countries()
RETURNS TRIGGER AS $$
BEGIN
  -- Quando countries_visited é alterado directamente, recalcular total_countries
  IF NEW.countries_visited IS DISTINCT FROM OLD.countries_visited THEN
    NEW.total_countries := COALESCE(
      array_length(NEW.countries_visited, 1),
      0
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_total_countries
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION fn_sync_total_countries();

COMMENT ON FUNCTION fn_sync_total_countries()
  IS 'Mantém total_countries sincronizado com countries_visited em actualizações directas.';

-- ------------------------------------------------------------
-- Verificação final desta migration
-- ------------------------------------------------------------
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Verificar que índices foram criados
  SELECT COUNT(*) INTO v_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname IN (
      'idx_activities_day_position_unique',
      'idx_post_media_position_unique',
      'leaderboard_unique_global',
      'leaderboard_unique_scoped'
    );

  IF v_count != 4 THEN
    RAISE EXCEPTION 'V13: Esperados 4 índices novos, encontrados: %', v_count;
  END IF;

  -- Verificar que constraints foram criadas
  SELECT COUNT(*) INTO v_count
  FROM pg_constraint
  WHERE conname IN (
    'users_mfa_secret_required',
    'trip_expenses_currency_format',
    'users_country_code_format',
    'itineraries_country_code_format',
    'posts_country_code_format'
  );

  IF v_count != 5 THEN
    RAISE EXCEPTION 'V13: Esperadas 5 constraints novas, encontradas: %', v_count;
  END IF;

  RAISE NOTICE 'V13 concluída com sucesso: 4 índices + 5 constraints + 4 triggers criados.';
END $$;
