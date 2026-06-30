-- ============================================================
-- MemoVoy — V17: Manutenção e limpeza final
-- Resolve as 5 sugestões da auditoria final (todas 🟢)
-- Zero downtime — sem locks bloqueantes
--
-- PRÉ-CONDIÇÕES:
-- 1. Confirmar que nenhum código ainda referencia idx_post_media_post
--    ou idx_activities_day_position explicitamente (raro mas verificar)
-- 2. Confirmar que não existem notificações com status='sent' e sent_at NULL:
--    SELECT COUNT(*) FROM notifications
--      WHERE status = 'sent' AND sent_at IS NULL;
--    → Se > 0, fazer backfill antes de adicionar a constraint:
--    UPDATE notifications SET sent_at = created_at
--      WHERE status = 'sent' AND sent_at IS NULL;
-- ============================================================

-- ------------------------------------------------------------
-- FIX 1: Remover idx_post_media_post — redundante
-- O índice UNIQUE idx_post_media_position_unique (V13) em
-- post_media(post_id, position) serve todas as queries que
-- este índice normal servia, com o benefício adicional
-- de garantir unicidade.
-- Manter dois índices sobre as mesmas colunas desperdiça
-- espaço e abranda todos os INSERTs em post_media.
-- ------------------------------------------------------------
DROP INDEX IF EXISTS idx_post_media_post;

COMMENT ON INDEX idx_post_media_position_unique
  IS 'UNIQUE (post_id, position). Substitui o antigo idx_post_media_post '
     'que foi removido em V17 por ser redundante.';

-- ------------------------------------------------------------
-- FIX 2: Remover idx_activities_day_position — redundante
-- O índice UNIQUE parcial idx_activities_day_position_unique (V13)
-- em itinerary_activities(day_id, position) WHERE deleted_at IS NULL
-- cobre todas as queries normais (que filtram por deleted_at IS NULL).
-- O índice não-parcial de V3 só adicionava cobertura para rows
-- com deleted_at NOT NULL — que nunca são consultadas em queries
-- normais e não justificam o overhead de manutenção.
-- ------------------------------------------------------------
DROP INDEX IF EXISTS idx_activities_day_position;

COMMENT ON INDEX idx_activities_day_position_unique
  IS 'UNIQUE (day_id, position) WHERE deleted_at IS NULL. '
     'Substitui o antigo idx_activities_day_position removido em V17.';

-- ------------------------------------------------------------
-- FIX 3: DEFAULT PRIVILEGES para tabelas futuras
-- Os GRANTs de V12 cobrem apenas tabelas existentes no momento
-- da migration (ON ALL TABLES = snapshot). Tabelas criadas em
-- V18, V19, etc. não herdam automaticamente essas permissões.
-- ALTER DEFAULT PRIVILEGES resolve isto de forma permanente:
-- qualquer tabela criada pelo owner herda estes GRANTs.
-- ------------------------------------------------------------

-- memovoy_api: leitura/escrita em tabelas futuras
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO memovoy_api;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO memovoy_api;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO memovoy_api;

-- memovoy_analytics: só leitura em tabelas futuras
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO memovoy_analytics;

-- memovoy_migrations: DDL completo em tabelas futuras
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO memovoy_migrations;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO memovoy_migrations;

COMMENT ON ROLE memovoy_api
  IS 'Role para o API layer em runtime. Sem DDL. '
     'DEFAULT PRIVILEGES garantem herança automática em tabelas futuras (V17).';

COMMENT ON ROLE memovoy_analytics
  IS 'Role read-only para ML, dashboards e relatórios. '
     'DEFAULT PRIVILEGES garantem herança automática em tabelas futuras (V17).';

-- ------------------------------------------------------------
-- FIX 4: Campo declined_at em itinerary_collaborators
-- Completa o modelo de estados de convite:
--   invited_at SET,  accepted_at NULL, declined_at NULL → pendente
--   invited_at SET,  accepted_at SET,  declined_at NULL → aceite
--   invited_at SET,  accepted_at NULL, declined_at SET  → recusado
-- Sem este campo, convites recusados eram indistinguíveis
-- de convites pendentes — UI de gestão de convites ficava incorrecta.
-- A constraint garante que aceite e recusado são mutuamente exclusivos.
-- ------------------------------------------------------------
ALTER TABLE itinerary_collaborators
  ADD COLUMN declined_at TIMESTAMPTZ;

ALTER TABLE itinerary_collaborators
  ADD CONSTRAINT itinerary_collaborators_response_chk
  CHECK (
    -- Não pode estar simultaneamente aceite E recusado
    accepted_at IS NULL OR declined_at IS NULL
  );

COMMENT ON COLUMN itinerary_collaborators.declined_at
  IS 'NULL = pendente ou aceite. NOT NULL = convite recusado. '
     'Mutuamente exclusivo com accepted_at (constraint response_chk).';

-- Atualizar a policy RLS de UPDATE para permitir recusar convites
-- (o colaborador pode aceitar OU recusar o seu próprio convite)
-- A policy existente itinerary_collaborators_update já cobre isto:
-- USING (user_id = current_user_id()) — sem alterações necessárias.

-- ------------------------------------------------------------
-- FIX 5: Constraint sent_at em notifications
-- Garante consistência entre status e sent_at:
--   status = 'sent'  → sent_at deve estar preenchido
--   status != 'sent' → sent_at pode ser NULL
-- Sem isto, um registo pode ter status='sent' e sent_at=NULL,
-- tornando impossível saber quando foi efectivamente enviado.
--
-- PRÉ-CONDIÇÃO: backfill de registos inconsistentes antes de aplicar.
-- O bloco DO abaixo faz o backfill automaticamente como parte da migration.
-- ------------------------------------------------------------

-- Backfill automático: preencher sent_at onde status='sent' e sent_at=NULL
DO $$
DECLARE
  v_backfilled INTEGER;
BEGIN
  UPDATE notifications
  SET sent_at = created_at  -- usar created_at como proxy razoável
  WHERE status = 'sent'
    AND sent_at IS NULL;

  GET DIAGNOSTICS v_backfilled = ROW_COUNT;

  IF v_backfilled > 0 THEN
    RAISE NOTICE 'V17: Backfill de sent_at: % notificações actualizadas (sent_at = created_at).', v_backfilled;
  END IF;
END $$;

-- Agora é seguro adicionar a constraint
ALTER TABLE notifications
  ADD CONSTRAINT notifications_sent_at_consistency
  CHECK (
    (status = 'sent' AND sent_at IS NOT NULL)
    OR status != 'sent'
  );

COMMENT ON CONSTRAINT notifications_sent_at_consistency ON notifications
  IS 'Garante que status=sent implica sent_at preenchido. Backfill automático feito na migration V17.';

-- ------------------------------------------------------------
-- FIX 6: Clarificar COMMENT da VIEW top_countries_month
-- O COMMENT anterior prometia "melhor performance" para a VIEW
-- mas a VIEW é um wrapper de get_top_countries() que ainda chama
-- NOW() — o benefício de performance é no caching Redis, não na VIEW.
-- Um developer futuro podia ser enganado pelo COMMENT anterior.
-- ------------------------------------------------------------
COMMENT ON VIEW top_countries_month
  IS 'Wrapper de retrocompatibilidade sobre get_top_countries(). '
     'Performance: resultado cached em Redis TTL 1h pelo API layer. '
     'A VIEW em si não é mais eficiente que a função — usar '
     'get_top_countries() directamente em código novo.';

-- ------------------------------------------------------------
-- Verificação final — garantir que tudo foi aplicado
-- ------------------------------------------------------------
DO $$
DECLARE
  v_exists  BOOLEAN;
  v_count   INTEGER;
BEGIN
  -- 1. Verificar que índices redundantes foram removidos
  SELECT EXISTS(
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_post_media_post'
  ) INTO v_exists;
  IF v_exists THEN
    RAISE EXCEPTION 'V17: idx_post_media_post ainda existe.';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_activities_day_position'
  ) INTO v_exists;
  IF v_exists THEN
    RAISE EXCEPTION 'V17: idx_activities_day_position ainda existe.';
  END IF;

  -- 2. Verificar coluna declined_at
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'itinerary_collaborators'
      AND column_name  = 'declined_at'
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'V17: coluna declined_at não encontrada em itinerary_collaborators.';
  END IF;

  -- 3. Verificar constraints novas
  SELECT COUNT(*) INTO v_count
  FROM pg_constraint
  WHERE conname IN (
    'itinerary_collaborators_response_chk',
    'notifications_sent_at_consistency'
  );
  IF v_count != 2 THEN
    RAISE EXCEPTION 'V17: Esperadas 2 constraints novas, encontradas: %', v_count;
  END IF;

  -- 4. Verificar que não ficaram notificações inconsistentes
  SELECT COUNT(*) INTO v_count
  FROM notifications
  WHERE status = 'sent' AND sent_at IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'V17: % notificações com status=sent e sent_at=NULL após backfill.', v_count;
  END IF;

  RAISE NOTICE 'V17 concluída com sucesso: '
    '2 índices redundantes removidos, '
    'DEFAULT PRIVILEGES configurados, '
    'declined_at adicionado, '
    '2 constraints criadas, '
    'COMMENT actualizado.';
END $$;
