-- ============================================================
-- MemoVoy — V11: Índices de performance adicionais
-- Corrige lacunas identificadas na auditoria final
-- ============================================================

-- ------------------------------------------------------------
-- FIX #6: índice para limpeza de sessões expiradas
-- O job diário que remove sessões expiradas fazia seq scan
-- ------------------------------------------------------------
CREATE INDEX idx_sessions_expires_at
  ON user_sessions(expires_at)
  WHERE revoked_at IS NULL;

COMMENT ON INDEX idx_sessions_expires_at
  IS 'Usado pelo job diário: DELETE FROM user_sessions WHERE expires_at < NOW() AND revoked_at IS NULL';

-- ------------------------------------------------------------
-- FIX #12: índice para breakdown de gastos por categoria
-- Query mais comum do expense tracker: total por categoria numa viagem
-- ------------------------------------------------------------
CREATE INDEX idx_trip_expenses_itinerary_category
  ON trip_expenses(itinerary_id, category, spent_at DESC);

COMMENT ON INDEX idx_trip_expenses_itinerary_category
  IS 'Suporta: SELECT category, SUM(amount_eur_cents) FROM trip_expenses WHERE itinerary_id = $1 GROUP BY category';

-- ------------------------------------------------------------
-- Índices adicionais de performance identificados na auditoria
-- ------------------------------------------------------------

-- Roteiros por IA para análise de feedback loop
CREATE INDEX idx_itineraries_ai_generated
  ON itineraries(ai_generated, published_at DESC)
  WHERE ai_generated = true AND status = 'published' AND deleted_at IS NULL;

-- Actividades com external_id para lookup de reservas
CREATE INDEX idx_activities_external
  ON itinerary_activities(external_source, external_id)
  WHERE external_id IS NOT NULL AND deleted_at IS NULL;

-- Notificações pendentes de envio (processadas pelo worker de notificações)
CREATE INDEX idx_notifications_pending_send
  ON notifications(channel, created_at)
  WHERE status = 'pending';

-- Desafios por tipo para queries de progresso (ex: todos os distance_km activos)
CREATE INDEX idx_challenges_type_active
  ON challenges(type, is_active)
  WHERE is_active = true;

-- Media pendente de moderação (fila de moderação automática)
CREATE INDEX idx_post_media_pending_moderation
  ON post_media(moderation_status, created_at)
  WHERE moderation_status = 'pending';

-- Leaderboard: lookup de entrada específica de um utilizador num período
CREATE INDEX idx_leaderboard_user_period
  ON leaderboard_entries(user_id, leaderboard_type, period_start DESC);

-- AI generations para análise de custos (tokens e duração por modelo)
CREATE INDEX idx_ai_generations_model_date
  ON ai_generations(model_used, created_at DESC);

-- ------------------------------------------------------------
-- Verificação final: listar todos os índices criados
-- ------------------------------------------------------------
DO $$
DECLARE
  idx_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO idx_count
  FROM pg_indexes
  WHERE schemaname = 'public';

  RAISE NOTICE 'MemoVoy: % índices totais no schema público', idx_count;
END $$;
