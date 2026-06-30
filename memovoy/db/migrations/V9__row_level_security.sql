-- ============================================================
-- MemoVoy — V9: Row Level Security (RLS)
-- Garante que utilizadores só acedem aos seus próprios dados
-- e que data residency é respeitada a nível de base de dados
-- ============================================================

-- ------------------------------------------------------------
-- Activar RLS nas tabelas sensíveis
-- ------------------------------------------------------------

ALTER TABLE users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_devices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_expenses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE itinerary_collaborators ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Policies: users
-- Utilizadores só veem e editam o seu próprio registo
-- Admins e moderadores veem tudo
-- ------------------------------------------------------------

-- Leitura própria
CREATE POLICY users_select_own ON users
  FOR SELECT
  USING (
    id = current_setting('app.current_user_id', true)::UUID
    OR current_setting('app.current_user_role', true) IN ('admin', 'moderator')
  );

-- Actualização própria
-- Nota: db_region é imutável — protegido por trigger abaixo, não por RLS
-- (RLS WITH CHECK não tem acesso a OLD, por isso usa-se trigger)
CREATE POLICY users_update_own ON users
  FOR UPDATE
  USING (id = current_setting('app.current_user_id', true)::UUID);

-- Trigger: impedir alteração de db_region após registo
-- (RLS não consegue comparar OLD vs NEW — este trigger preenche essa lacuna)
CREATE OR REPLACE FUNCTION fn_protect_db_region()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.db_region != OLD.db_region THEN
    RAISE EXCEPTION
      'db_region é imutável após registo. Tentativa de alterar de "%" para "%".',
      OLD.db_region, NEW.db_region;
  END IF;
  -- Também proteger role de ser alterado por não-admins
  IF NEW.role != OLD.role
    AND current_setting('app.current_user_role', true) NOT IN ('admin')
  THEN
    RAISE EXCEPTION 'Apenas admins podem alterar o role de um utilizador.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_protect_db_region
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION fn_protect_db_region();

-- ------------------------------------------------------------
-- Policies: user_preferences
-- ------------------------------------------------------------
CREATE POLICY user_preferences_own ON user_preferences
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

-- ------------------------------------------------------------
-- Policies: user_devices
-- ------------------------------------------------------------
CREATE POLICY user_devices_own ON user_devices
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

-- ------------------------------------------------------------
-- Policies: user_sessions
-- ------------------------------------------------------------
CREATE POLICY user_sessions_own ON user_sessions
  FOR SELECT
  USING (
    user_id = current_setting('app.current_user_id', true)::UUID
    OR current_setting('app.current_user_role', true) = 'admin'
  );

CREATE POLICY user_sessions_revoke_own ON user_sessions
  FOR UPDATE
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

-- ------------------------------------------------------------
-- Policies: trip_expenses
-- Gastos só visíveis ao dono do roteiro e colaboradores
-- ------------------------------------------------------------
CREATE POLICY trip_expenses_own ON trip_expenses
  FOR ALL
  USING (
    user_id = current_setting('app.current_user_id', true)::UUID
    OR EXISTS (
      SELECT 1 FROM itinerary_collaborators ic
      WHERE ic.itinerary_id = trip_expenses.itinerary_id
        AND ic.user_id = current_setting('app.current_user_id', true)::UUID
        AND ic.accepted_at IS NOT NULL
    )
  );

-- ------------------------------------------------------------
-- Policies: notifications
-- ------------------------------------------------------------
CREATE POLICY notifications_own ON notifications
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

-- ------------------------------------------------------------
-- Policies: itinerary_collaborators
-- Colaboradores veem e editam apenas roteiros onde participam
-- ------------------------------------------------------------
CREATE POLICY itinerary_collaborators_own ON itinerary_collaborators
  FOR SELECT
  USING (
    user_id = current_setting('app.current_user_id', true)::UUID
    OR itinerary_id IN (
      SELECT id FROM itineraries
      WHERE user_id = current_setting('app.current_user_id', true)::UUID
    )
  );

-- ------------------------------------------------------------
-- Perfis públicos: user_profiles são públicos por definição
-- mas soft-deleted não são visíveis
-- ------------------------------------------------------------
CREATE POLICY user_profiles_public_read ON user_profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_profiles.user_id
        AND u.deleted_at IS NULL
    )
  );

CREATE POLICY user_profiles_own_write ON user_profiles
  FOR UPDATE
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

-- ------------------------------------------------------------
-- NOTA DE IMPLEMENTAÇÃO
-- O API layer deve definir as variáveis de sessão antes
-- de qualquer query:
--
--   SET LOCAL app.current_user_id   = '<uuid>';
--   SET LOCAL app.current_user_role = 'user';
--
-- Estas variáveis são locais à transação — não persistem.
-- O service account da API tem BYPASSRLS para queries admin.
-- ------------------------------------------------------------

COMMENT ON TABLE users IS 'RLS activo. Utilizadores só veem o seu próprio registo.';
COMMENT ON TABLE trip_expenses IS 'RLS activo. Visível ao dono e colaboradores do roteiro.';
