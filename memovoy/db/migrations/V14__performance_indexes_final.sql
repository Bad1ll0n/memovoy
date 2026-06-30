-- ============================================================
-- MemoVoy — V14: Performance — índices em falta e redundantes
-- Zero downtime — todos os CREATE usam CONCURRENTLY
-- ============================================================

-- ------------------------------------------------------------
-- FIX 1: Remover idx_crowding_geo_hash — redundante com PK
-- PRIMARY KEY (location_geo_hash, day_of_week, hour_of_day)
-- já serve lookups por location_geo_hash como prefixo de índice.
-- Este índice adicional ocupa espaço e abranda writes sem benefício.
-- ------------------------------------------------------------
DROP INDEX IF EXISTS idx_crowding_geo_hash;

-- ------------------------------------------------------------
-- FIX 2: Índice composto feed_interactions (user_id, post_id)
-- Query ML mais frequente: "interacções de user X com post Y"
-- (ex: verificar se já deu skip antes de mostrar novamente)
-- Sem este índice: scan no chunk activo inteiro por user_id
-- ------------------------------------------------------------
CREATE INDEX CONCURRENTLY idx_feed_interactions_user_post
  ON feed_interactions(user_id, post_id, interaction_type, created_at DESC);

COMMENT ON INDEX idx_feed_interactions_user_post
  IS 'Cobre: SELECT * FROM feed_interactions WHERE user_id=$1 AND post_id=$2. Query ML mais frequente.';

-- ------------------------------------------------------------
-- FIX 3: Índice para feed de descoberta global
-- Utilizado por utilizadores novos sem seguidores ainda.
-- Não existia nenhum índice que cobrisse posts públicos
-- recentes de qualquer autor ordenados por data/popularidade.
-- ------------------------------------------------------------
CREATE INDEX CONCURRENTLY idx_posts_global_discovery
  ON posts(created_at DESC, likes_count DESC)
  WHERE deleted_at IS NULL
    AND is_hidden = false
    AND visibility = 'public';

COMMENT ON INDEX idx_posts_global_discovery
  IS 'Feed de descoberta global — usado por utilizadores novos sem seguidores.';

-- ------------------------------------------------------------
-- FIX 4: Índice para sessões suspeitas activas
-- Dashboard de segurança e job de alertas precisa de listar
-- sessões com is_suspicious=true sem seq scan na tabela inteira.
-- ------------------------------------------------------------
CREATE INDEX CONCURRENTLY idx_sessions_suspicious_active
  ON user_sessions(user_id, created_at DESC)
  WHERE is_suspicious = true
    AND revoked_at IS NULL;

COMMENT ON INDEX idx_sessions_suspicious_active
  IS 'Usado pelo dashboard de segurança e alertas de anomaly detection.';

-- ------------------------------------------------------------
-- FIX 5: Índice de cobertura para lookup de perfil público
-- Elimina heap fetch na query username → dados básicos do utilizador
-- INCLUDE evita ir ao heap para os campos mais acedidos
-- ------------------------------------------------------------
CREATE INDEX CONCURRENTLY idx_users_profile_lookup
  ON users(username)
  INCLUDE (id, role, is_private, is_verified, follower_count)
  WHERE deleted_at IS NULL;

COMMENT ON INDEX idx_users_profile_lookup
  IS 'Índice de cobertura: username lookup sem heap fetch para campos básicos do perfil.';

-- ------------------------------------------------------------
-- FIX 6: Índice para limpeza periódica de notificações
-- Job que remove notificações lidas com mais de 90 dias
-- ------------------------------------------------------------
CREATE INDEX CONCURRENTLY idx_notifications_cleanup
  ON notifications(read_at)
  WHERE read_at IS NOT NULL;

COMMENT ON INDEX idx_notifications_cleanup
  IS 'Usado pelo job: DELETE FROM notifications WHERE read_at < NOW() - INTERVAL 90 days.';

-- ------------------------------------------------------------
-- Verificação final
-- ------------------------------------------------------------
DO $$
DECLARE
  v_count INTEGER;
  v_exists BOOLEAN;
BEGIN
  -- Confirmar que índice redundante foi removido
  SELECT EXISTS(
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_crowding_geo_hash'
  ) INTO v_exists;

  IF v_exists THEN
    RAISE EXCEPTION 'V14: idx_crowding_geo_hash ainda existe — DROP falhou.';
  END IF;

  -- Confirmar novos índices
  SELECT COUNT(*) INTO v_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND indexname IN (
      'idx_feed_interactions_user_post',
      'idx_posts_global_discovery',
      'idx_sessions_suspicious_active',
      'idx_users_profile_lookup',
      'idx_notifications_cleanup'
    );

  IF v_count != 5 THEN
    RAISE EXCEPTION 'V14: Esperados 5 índices novos, encontrados: %', v_count;
  END IF;

  RAISE NOTICE 'V14 concluída: 1 índice redundante removido, 5 novos criados.';
END $$;
