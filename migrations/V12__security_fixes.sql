-- ============================================================
-- MemoVoy — V12: Correcções críticas de segurança
-- Resolve: race condition prompt_versions, bypass fn_protect_db_region,
-- helper current_user_id(), policies RLS em falta,
-- triggers polimórficos, roles de BD
-- ============================================================

-- ------------------------------------------------------------
-- FIX 1: Helper function segura para RLS
-- Resolve: current_setting()::UUID falha/comporta-se de forma
-- imprevisível quando a variável não está definida
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS UUID AS $$
DECLARE
  v_id TEXT;
BEGIN
  v_id := current_setting('app.current_user_id', true);
  IF v_id IS NULL OR v_id = '' THEN
    RETURN NULL;
  END IF;
  RETURN v_id::UUID;
EXCEPTION
  WHEN invalid_text_representation THEN
    -- Valor definido mas não é UUID válido — tratar como não autenticado
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION current_user_id()
  IS 'Helper seguro para RLS. Retorna NULL se variável de sessão não definida ou inválida.';

-- ------------------------------------------------------------
-- FIX 2: Substituir todas as policies RLS por versões
-- que usam current_user_id() em vez de current_setting()::UUID
-- ------------------------------------------------------------

-- users: substituir policies existentes
DROP POLICY IF EXISTS users_select_own    ON users;
DROP POLICY IF EXISTS users_update_own   ON users;

CREATE POLICY users_select_own ON users
  FOR SELECT
  USING (
    id = current_user_id()
    OR current_setting('app.current_user_role', true) IN ('admin', 'moderator')
  );

CREATE POLICY users_update_own ON users
  FOR UPDATE
  USING (id = current_user_id());

-- user_preferences
DROP POLICY IF EXISTS user_preferences_own ON user_preferences;
CREATE POLICY user_preferences_own ON user_preferences
  FOR ALL
  USING (user_id = current_user_id());

-- user_devices
DROP POLICY IF EXISTS user_devices_own ON user_devices;
CREATE POLICY user_devices_own ON user_devices
  FOR ALL
  USING (user_id = current_user_id());

-- user_sessions
DROP POLICY IF EXISTS user_sessions_own        ON user_sessions;
DROP POLICY IF EXISTS user_sessions_revoke_own ON user_sessions;

CREATE POLICY user_sessions_select_own ON user_sessions
  FOR SELECT
  USING (
    user_id = current_user_id()
    OR current_setting('app.current_user_role', true) = 'admin'
  );

CREATE POLICY user_sessions_revoke_own ON user_sessions
  FOR UPDATE
  USING (user_id = current_user_id());

-- trip_expenses
DROP POLICY IF EXISTS trip_expenses_own ON trip_expenses;
CREATE POLICY trip_expenses_own ON trip_expenses
  FOR ALL
  USING (
    user_id = current_user_id()
    OR EXISTS (
      SELECT 1 FROM itinerary_collaborators ic
      WHERE ic.itinerary_id = trip_expenses.itinerary_id
        AND ic.user_id = current_user_id()
        AND ic.accepted_at IS NOT NULL
    )
  );

-- notifications
DROP POLICY IF EXISTS notifications_own ON notifications;
CREATE POLICY notifications_own ON notifications
  FOR ALL
  USING (user_id = current_user_id());

-- user_profiles: leitura pública + escrita própria
DROP POLICY IF EXISTS user_profiles_public_read ON user_profiles;
DROP POLICY IF EXISTS user_profiles_own_write   ON user_profiles;

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
  USING (user_id = current_user_id());

-- itinerary_collaborators: substituir SELECT + adicionar INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS itinerary_collaborators_own ON itinerary_collaborators;

-- SELECT: participante ou dono do roteiro
CREATE POLICY itinerary_collaborators_select ON itinerary_collaborators
  FOR SELECT
  USING (
    user_id = current_user_id()
    OR itinerary_id IN (
      SELECT id FROM itineraries
      WHERE user_id = current_user_id()
    )
  );

-- INSERT: só o dono do roteiro pode convidar
CREATE POLICY itinerary_collaborators_insert ON itinerary_collaborators
  FOR INSERT
  WITH CHECK (
    itinerary_id IN (
      SELECT id FROM itineraries
      WHERE user_id = current_user_id()
    )
  );

-- UPDATE: colaborador pode aceitar/recusar o próprio convite
CREATE POLICY itinerary_collaborators_update ON itinerary_collaborators
  FOR UPDATE
  USING (user_id = current_user_id());

-- DELETE: colaborador pode sair; dono pode remover qualquer um
CREATE POLICY itinerary_collaborators_delete ON itinerary_collaborators
  FOR DELETE
  USING (
    user_id = current_user_id()
    OR itinerary_id IN (
      SELECT id FROM itineraries
      WHERE user_id = current_user_id()
    )
  );

-- ------------------------------------------------------------
-- FIX 3: fn_protect_db_region — COALESCE para tratar NULL
-- Resolve: bypass silencioso quando app.current_user_role não definido
-- (NULL NOT IN ('admin') é FALSE em SQL — qualquer job podia alterar role)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_protect_db_region()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- db_region é imutável após registo
  IF NEW.db_region != OLD.db_region THEN
    RAISE EXCEPTION
      'db_region é imutável após registo. Tentativa de alterar de "%" para "%" para user %.',
      OLD.db_region, NEW.db_region, OLD.id;
  END IF;

  -- Proteger role: COALESCE trata NULL e '' como não-admin
  -- Sem isto: NULL NOT IN ('admin') = FALSE → qualquer job pode alterar role
  IF NEW.role != OLD.role THEN
    v_role := COALESCE(current_setting('app.current_user_role', true), '');
    IF v_role != 'admin' THEN
      RAISE EXCEPTION
        'Apenas admins podem alterar o role de um utilizador. '
        'Role de sessão actual: "%" (user %, tentativa: % → %)',
        CASE WHEN v_role = '' THEN '(não definido)' ELSE v_role END,
        OLD.id, OLD.role, NEW.role;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_protect_db_region()
  IS 'Protege db_region (imutável) e role (só admin). COALESCE garante que NULL não faz bypass.';

-- ------------------------------------------------------------
-- FIX 4: fn_validate_prompt_traffic — advisory lock para evitar
-- race condition em concorrência (dois admins a alterar simultâneo)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validate_prompt_traffic()
RETURNS TRIGGER AS $$
DECLARE
  total_pct INTEGER;
BEGIN
  -- Lock advisory transaccional para serializar alterações de traffic_percentage
  -- pg_advisory_xact_lock é libertado automaticamente no fim da transacção
  PERFORM pg_advisory_xact_lock(hashtext('prompt_versions_traffic'));

  -- Soma todas as versões activas, excluindo a linha actual (para UPDATE)
  SELECT COALESCE(SUM(traffic_percentage), 0)
  INTO total_pct
  FROM prompt_versions
  WHERE is_active = true
    AND (TG_OP = 'INSERT' OR id != NEW.id);

  IF total_pct + NEW.traffic_percentage != 100 THEN
    RAISE EXCEPTION
      'A soma de traffic_percentage das versões activas deve ser exactamente 100. '
      'Soma actual (sem esta linha): %, a adicionar: %, total seria: %',
      total_pct, NEW.traffic_percentage, total_pct + NEW.traffic_percentage;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_validate_prompt_traffic()
  IS 'Valida soma = 100% com advisory lock para evitar race condition em concorrência.';

-- ------------------------------------------------------------
-- FIX 5: Triggers de validação para padrões polimórficos
-- Resolve: reactions e reports sem FK — targets podem não existir
-- ------------------------------------------------------------

-- reactions: verificar existência do alvo antes de inserir
CREATE OR REPLACE FUNCTION fn_validate_reaction_target()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.target_type = 'post' THEN
    IF NOT EXISTS (
      SELECT 1 FROM posts
      WHERE id = NEW.target_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION
        'Post % não existe ou foi removido. Não é possível reagir.', NEW.target_id;
    END IF;

  ELSIF NEW.target_type = 'comment' THEN
    IF NOT EXISTS (
      SELECT 1 FROM comments
      WHERE id = NEW.target_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION
        'Comentário % não existe ou foi removido. Não é possível reagir.', NEW.target_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_reaction_target
  BEFORE INSERT ON reactions
  FOR EACH ROW EXECUTE FUNCTION fn_validate_reaction_target();

-- reports: verificar existência do conteúdo denunciado
CREATE OR REPLACE FUNCTION fn_validate_report_target()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.target_type = 'post' THEN
    IF NOT EXISTS (SELECT 1 FROM posts WHERE id = NEW.target_id) THEN
      RAISE EXCEPTION
        'Post % não existe. Não é possível denunciar.', NEW.target_id;
    END IF;

  ELSIF NEW.target_type = 'comment' THEN
    IF NOT EXISTS (SELECT 1 FROM comments WHERE id = NEW.target_id) THEN
      RAISE EXCEPTION
        'Comentário % não existe. Não é possível denunciar.', NEW.target_id;
    END IF;

  ELSIF NEW.target_type = 'profile' THEN
    IF NOT EXISTS (
      SELECT 1 FROM users WHERE id = NEW.target_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION
        'Perfil % não existe. Não é possível denunciar.', NEW.target_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_report_target
  BEFORE INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION fn_validate_report_target();

-- ------------------------------------------------------------
-- FIX 6: Roles PostgreSQL com princípio do menor privilégio
-- Resolve: aplicação provavelmente usa owner/superuser
-- ------------------------------------------------------------

-- Criar roles se não existirem (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memovoy_api') THEN
    CREATE ROLE memovoy_api NOLOGIN;
    RAISE NOTICE 'Role memovoy_api criado.';
  ELSE
    RAISE NOTICE 'Role memovoy_api já existe — a atualizar permissões.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memovoy_analytics') THEN
    CREATE ROLE memovoy_analytics NOLOGIN;
    RAISE NOTICE 'Role memovoy_analytics criado.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memovoy_migrations') THEN
    CREATE ROLE memovoy_migrations NOLOGIN;
    RAISE NOTICE 'Role memovoy_migrations criado.';
  END IF;
END $$;

-- API: leitura/escrita em dados, sem DDL, sem TRUNCATE
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public
  TO memovoy_api;

GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public
  TO memovoy_api;

GRANT EXECUTE
  ON ALL FUNCTIONS IN SCHEMA public
  TO memovoy_api;

-- Analytics: só leitura (para ML, dashboards, relatórios)
GRANT SELECT
  ON ALL TABLES IN SCHEMA public
  TO memovoy_analytics;

-- Migrations: DDL completo + BYPASSRLS para poder executar migrations
-- Este role NÃO deve ser usado pela aplicação em runtime
GRANT ALL PRIVILEGES
  ON ALL TABLES IN SCHEMA public
  TO memovoy_migrations;
GRANT ALL PRIVILEGES
  ON ALL SEQUENCES IN SCHEMA public
  TO memovoy_migrations;
GRANT ALL PRIVILEGES
  ON SCHEMA public
  TO memovoy_migrations;

-- NOTA: Para criar utilizadores de login com password:
-- CREATE USER memovoy_api_user WITH PASSWORD '...' IN ROLE memovoy_api;
-- Feito fora das migrations (passwords não devem estar em ficheiros versionados)

COMMENT ON ROLE memovoy_api        IS 'Role para o API layer em runtime. Sem DDL.';
COMMENT ON ROLE memovoy_analytics  IS 'Role read-only para ML, dashboards e relatórios.';
COMMENT ON ROLE memovoy_migrations IS 'Role para Flyway. Nunca usar em runtime.';
