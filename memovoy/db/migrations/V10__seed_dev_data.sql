-- ============================================================
-- MemoVoy — V10: Seed data para desenvolvimento
-- NÃO executar em produção — apenas em dev/staging
-- ============================================================

-- Guard: abortar se estiver em produção
DO $$
BEGIN
  IF current_database() NOT IN ('memovoy_dev', 'memovoy_staging', 'memovoy_test') THEN
    RAISE EXCEPTION 'V10 seed data: não executar em produção. DB actual: %', current_database();
  END IF;
END $$;

-- ------------------------------------------------------------
-- Badges iniciais
-- ------------------------------------------------------------
INSERT INTO badges (id, name, description, icon_url, category) VALUES
  (generate_ulid(), 'Primeiro Roteiro',       'Publicaste o teu primeiro roteiro',                 '/badges/first-itinerary.svg',  'challenge'),
  (generate_ulid(), 'Explorador',             'Completaste 3 viagens',                             '/badges/explorer.svg',         'level'),
  (generate_ulid(), 'Viajante',               'Completaste 10 viagens',                            '/badges/traveler.svg',         'level'),
  (generate_ulid(), 'Nómada',                 'Visitaste 10 países diferentes',                    '/badges/nomad.svg',            'level'),
  (generate_ulid(), 'Globetrotter',           'Visitaste 25 países diferentes',                    '/badges/globetrotter.svg',     'level'),
  (generate_ulid(), 'Viagem Verde',           'Completaste uma viagem com menos de 100kg CO₂',     '/badges/green-travel.svg',     'sustainability'),
  (generate_ulid(), 'Caminhante de Paris',    'Andaste 50km em Paris',                             '/badges/paris-walker.svg',     'challenge'),
  (generate_ulid(), 'Gourmet',                'Visitaste 10 restaurantes em roteiros diferentes',  '/badges/gourmet.svg',          'challenge'),
  (generate_ulid(), 'Social Star',            'Os teus roteiros foram guardados 100 vezes',        '/badges/social-star.svg',      'social'),
  (generate_ulid(), 'Streak 3',              'Publicaste roteiros 3 meses consecutivos',          '/badges/streak-3.svg',         'challenge');

-- ------------------------------------------------------------
-- Desafios iniciais
-- ------------------------------------------------------------
INSERT INTO challenges (title, description, type, target_value, location_name, is_active) VALUES
  (
    '50km a pé em Paris',
    'Caminha 50km na cidade de Paris durante as tuas visitas. Integra com HealthKit/Google Fit.',
    'distance_km', 50, 'Paris',
    true
  ),
  (
    'Visita 5 museus em Roma',
    'Adiciona 5 museus ao teu roteiro de Roma e marca como visitados.',
    'visit_places', 5, 'Roma',
    true
  ),
  (
    'Partilha 3 roteiros este mês',
    'Publica 3 roteiros completos durante o mês actual.',
    'post_count', 3, NULL,
    true
  ),
  (
    'Guarda 10 roteiros',
    'Guarda 10 roteiros de outros utilizadores para inspiração.',
    'save_count', 10, NULL,
    true
  ),
  (
    'Visita 5 países',
    'Publica roteiros para 5 países diferentes.',
    'country_count', 5, NULL,
    true
  ),
  (
    'Viagem Verde',
    'Completa uma viagem com pegada de carbono abaixo de 100kg CO₂.',
    'low_carbon', 100, NULL,
    true
  );

-- ------------------------------------------------------------
-- Utilizador de teste (apenas dev)
-- Password: TestPassword123! (bcrypt hash abaixo)
-- ------------------------------------------------------------
WITH new_user AS (
  INSERT INTO users (
    email_encrypted, email_hash, username,
    password_hash, auth_provider, db_region,
    country_code, language, role,
    is_verified, gdpr_consent_at
  ) VALUES (
    pgp_sym_encrypt('dev@memovoy.com', 'dev-encryption-key-change-in-prod'),
    encode(digest('dev@memovoy.com', 'sha256'), 'hex'),
    'memovoy_dev',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewlpMXA5C2vEFGjy',
    'email', 'eu-central-1',
    'PT', 'pt-PT', 'admin',
    true, NOW()
  )
  RETURNING id
)
INSERT INTO user_profiles (user_id, display_name, bio, level)
SELECT id, 'MemoVoy Dev', 'Conta de desenvolvimento', 'globetrotter'
FROM new_user;

-- ------------------------------------------------------------
-- Verificação final: contar tabelas criadas
-- ------------------------------------------------------------
DO $$
DECLARE
  table_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE';

  RAISE NOTICE 'MemoVoy schema criado com sucesso: % tabelas', table_count;

  IF table_count < 30 THEN
    RAISE WARNING 'Esperado >= 30 tabelas, encontrado: %. Verificar migrations anteriores.', table_count;
  END IF;
END $$;
