-- ============================================================
-- MemoVoy — V16: audit_logs hypertable + user_stats MATERIALIZED
--
-- PRÉ-CONDIÇÕES obrigatórias antes de executar em produção:
--
-- 1. Confirmar que TimescaleDB está instalado e activo:
--    SELECT installed_version FROM pg_available_extensions
--    WHERE name = 'timescaledb';
--
-- 2. Estimar volume actual de audit_logs:
--    SELECT COUNT(*), MIN(created_at), MAX(created_at) FROM audit_logs;
--
-- 3. Janela de manutenção recomendada: fora das horas de pico
--    A alteração da PK causa um breve lock (~1-5 segundos em tabelas
--    com menos de 10M linhas). Em produção com tráfego alto, usar
--    pg_repack para zero-downtime ou executar às 3h UTC.
--
-- 4. Fazer backup antes de executar:
--    pg_dump -t audit_logs memovoy_prod > audit_logs_backup.sql
--
-- ROLLBACK se necessário:
--    Ver secção de rollback no final deste ficheiro.
-- ============================================================

-- ============================================================
-- PARTE 1: audit_logs → TimescaleDB hypertable
-- ============================================================

-- ------------------------------------------------------------
-- Passo 1: Alterar PRIMARY KEY para incluir created_at
-- Obrigatório para TimescaleDB: a coluna de partição deve
-- fazer parte de todos os índices únicos e da PK.
-- Este passo causa um breve lock exclusivo na tabela.
-- ------------------------------------------------------------
ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_pkey;
ALTER TABLE audit_logs ADD PRIMARY KEY (id, created_at);

-- Recriar índices de actor e target (agora com created_at na PK)
-- Os índices parciais existentes (idx_audit_logs_actor, idx_audit_logs_target)
-- continuam válidos — não precisam de ser recriados.

-- ------------------------------------------------------------
-- Passo 2: Converter em hypertable
-- chunk_time_interval = 1 mês: chunks mensais são adequados
-- para queries de compliance RGPD (ex: "todas as acções de
-- um utilizador no último ano") e para a política de retenção.
-- ------------------------------------------------------------
SELECT create_hypertable(
  'audit_logs',
  'created_at',
  chunk_time_interval => INTERVAL '1 month',
  if_not_exists       => TRUE,
  migrate_data        => TRUE   -- migra dados existentes para chunks
);

-- ------------------------------------------------------------
-- Passo 3: Compressão automática de chunks antigos
-- Chunks com mais de 6 meses são comprimidos (10-20x menos espaço)
-- mantendo queryability completa.
-- ------------------------------------------------------------
ALTER TABLE audit_logs SET (
  timescaledb.compress,
  timescaledb.compress_orderby    = 'created_at DESC',
  timescaledb.compress_segmentby  = 'actor_type, action'
);

SELECT add_compression_policy('audit_logs', INTERVAL '6 months');

-- ------------------------------------------------------------
-- Passo 4: Política de retenção — 7 anos (requisito RGPD)
-- Chunks com mais de 7 anos são removidos automaticamente.
-- Ajustar conforme requisitos legais do mercado.
-- ------------------------------------------------------------
SELECT add_retention_policy('audit_logs', INTERVAL '7 years');

COMMENT ON TABLE audit_logs
  IS 'Append-only por RGPD/LGPD. TimescaleDB hypertable com chunks mensais. '
     'Compressão automática após 6 meses. Retenção de 7 anos.';

-- ============================================================
-- PARTE 2: user_stats → MATERIALIZED VIEW
-- ============================================================

-- ------------------------------------------------------------
-- A VIEW user_stats faz GROUP BY em 4 tabelas com LEFT JOINs.
-- Para perfis com muitos badges, é recalculada a cada query.
-- A MATERIALIZED VIEW pré-calcula o resultado e permite
-- refresh CONCURRENTLY (sem bloquear leituras).
-- ------------------------------------------------------------

-- Remover VIEW simples
DROP VIEW IF EXISTS user_stats;

-- Criar como MATERIALIZED VIEW
CREATE MATERIALIZED VIEW user_stats AS
SELECT
  u.id                        AS user_id,
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
  COUNT(DISTINCT ub.badge_id) AS badge_count
FROM users u
JOIN user_profiles up         ON up.user_id = u.id
LEFT JOIN streaks s           ON s.user_id = u.id
LEFT JOIN user_badges ub      ON ub.user_id = u.id
WHERE u.deleted_at IS NULL
GROUP BY
  u.id,
  up.user_id,
  s.user_id,
  up.display_name,
  up.avatar_url,
  up.level,
  u.follower_count,
  up.following_count,
  up.total_trips,
  up.total_countries,
  up.countries_visited,
  s.current_streak,
  s.longest_streak
WITH DATA;

-- Índice único obrigatório para REFRESH CONCURRENTLY
CREATE UNIQUE INDEX idx_user_stats_user_id
  ON user_stats(user_id);

-- Índices adicionais para queries frequentes
CREATE INDEX idx_user_stats_username
  ON user_stats(username);

CREATE INDEX idx_user_stats_level
  ON user_stats(level);

COMMENT ON MATERIALIZED VIEW user_stats
  IS 'Pré-calculado. Refrescar com: REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats. '
     'Chamar após: INSERT em user_badges, UPDATE em user_profiles, UPDATE em streaks.';

-- ------------------------------------------------------------
-- Função de refresh da MATERIALIZED VIEW
-- Deve ser chamada pelos triggers de eventos relevantes
-- ou por um job periódico (ex: a cada 5 minutos).
-- CONCURRENTLY não bloqueia leituras durante o refresh.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_user_stats()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_user_stats()
  IS 'Refresca user_stats sem bloquear leituras (CONCURRENTLY). '
     'Chamar após alterações em user_badges, user_profiles ou streaks.';

-- ------------------------------------------------------------
-- Trigger para refresh automático após ganho de badge
-- Nota: REFRESH CONCURRENTLY em trigger pode ser lento em
-- produção com muita carga — considerar job periódico em alternativa.
-- Activar apenas se o lag de dados for crítico para o produto.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_refresh_user_stats_on_badge()
RETURNS TRIGGER AS $$
BEGIN
  -- Refresh assíncrono via NOTIFY para o worker externo fazer o refresh
  -- Em vez de REFRESH directo no trigger (que bloqueia a transacção)
  PERFORM pg_notify('user_stats_refresh', NEW.user_id::TEXT);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_refresh_user_stats_badge
  AFTER INSERT ON user_badges
  FOR EACH ROW EXECUTE FUNCTION fn_refresh_user_stats_on_badge();

COMMENT ON TRIGGER trg_refresh_user_stats_badge ON user_badges
  IS 'Envia NOTIFY para worker externo fazer REFRESH CONCURRENTLY. '
     'O worker deve escutar o canal user_stats_refresh e chamar refresh_user_stats().';

-- ============================================================
-- PARTE 3: Verificação final
-- ============================================================
DO $$
DECLARE
  v_is_hypertable BOOLEAN;
  v_mat_view      BOOLEAN;
  v_policies      INTEGER;
BEGIN
  -- Verificar que audit_logs é hypertable
  SELECT EXISTS(
    SELECT 1 FROM timescaledb_information.hypertables
    WHERE hypertable_name = 'audit_logs'
  ) INTO v_is_hypertable;

  IF NOT v_is_hypertable THEN
    RAISE EXCEPTION 'V16: audit_logs não foi convertida em hypertable.';
  END IF;

  -- Verificar políticas de compressão e retenção
  SELECT COUNT(*) INTO v_policies
  FROM timescaledb_information.jobs
  WHERE hypertable_name = 'audit_logs'
    AND proc_name IN ('policy_compression', 'policy_retention');

  IF v_policies < 2 THEN
    RAISE WARNING 'V16: Esperadas 2 políticas (compressão + retenção) em audit_logs, encontradas: %', v_policies;
  END IF;

  -- Verificar MATERIALIZED VIEW
  SELECT EXISTS(
    SELECT 1 FROM pg_matviews
    WHERE schemaname = 'public'
      AND matviewname = 'user_stats'
  ) INTO v_mat_view;

  IF NOT v_mat_view THEN
    RAISE EXCEPTION 'V16: user_stats MATERIALIZED VIEW não encontrada.';
  END IF;

  RAISE NOTICE 'V16 concluída: audit_logs → hypertable TimescaleDB (chunks mensais, compressão 6m, retenção 7a). user_stats → MATERIALIZED VIEW com refresh CONCURRENTLY.';
END $$;

-- ============================================================
-- ROLLBACK SCRIPT (executar manualmente se necessário)
-- ============================================================
-- NÃO executar automaticamente — apenas em caso de falha
--
-- -- Reverter user_stats de MATERIALIZED VIEW para VIEW simples:
-- DROP MATERIALIZED VIEW IF EXISTS user_stats CASCADE;
-- CREATE OR REPLACE VIEW user_stats AS
--   SELECT u.id AS user_id, u.username, up.display_name, up.avatar_url,
--     up.level, u.follower_count, up.following_count, up.total_trips,
--     up.total_countries, up.countries_visited, s.current_streak,
--     s.longest_streak, COUNT(DISTINCT ub.badge_id) AS badge_count
--   FROM users u
--   JOIN user_profiles up ON up.user_id = u.id
--   LEFT JOIN streaks s ON s.user_id = u.id
--   LEFT JOIN user_badges ub ON ub.user_id = u.id
--   WHERE u.deleted_at IS NULL
--   GROUP BY u.id, up.user_id, s.user_id;
--
-- -- Reverter audit_logs de hypertable para tabela normal:
-- -- (requer recriar a tabela — não é possível desfazer hypertable directamente)
-- -- Ver: https://docs.timescale.com/use-timescale/latest/hypertables/about-hypertables/
-- ============================================================
