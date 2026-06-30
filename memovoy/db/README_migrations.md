# MemoVoy — Database Migrations

PostgreSQL 16 + PostGIS + TimescaleDB. Gerido com Flyway (expand-contract pattern).

## Estrutura

```
db/
└── migrations/
    ├── V1__extensions_and_base.sql    # Extensões e funções helper
    ├── V2__users_domain.sql           # Utilizadores, sessões, follows
    ├── V3__itineraries_domain.sql     # Roteiros, dias, atividades, carbono
    ├── V4__social_domain.sql          # Posts, comentários, reactions, saves, reports
    ├── V5__gamification_domain.sql    # Badges, desafios, streaks, leaderboard
    ├── V6__ai_ml_domain.sql           # IA, prompt versions, feed interactions, crowding
    ├── V7__system_domain.sql          # Notifications, audit_logs, feature_flags, expenses
    ├── V8__views_and_functions.sql    # Views, funções utilitárias, jobs periódicos
    ├── V9__row_level_security.sql     # RLS para RGPD/LGPD
    └── V10__seed_dev_data.sql         # Seed data (DEV/STAGING apenas)
```

## Setup rápido (Docker)

```bash
chmod +x setup_db.sh
./setup_db.sh docker
```

## Setup manual

### 1. Requisitos
- PostgreSQL 16+
- Extensão PostGIS
- Extensão TimescaleDB
- Extensão pg_idkit (UUID v7)
- Flyway 10+ (ou usar psql directamente)

### 2. Criar base de dados

```bash
createdb memovoy_dev
createdb memovoy_staging
createdb memovoy_test
```

### 3. Executar migrations

```bash
# Com Flyway
flyway -url="jdbc:postgresql://localhost:5432/memovoy_dev" \
       -user=memovoy -password=<password> \
       -locations="filesystem:./db/migrations" \
       migrate

# Ou com psql directamente
for f in db/migrations/V*.sql; do psql memovoy_dev -f "$f"; done
```

### 4. Verificar

```bash
./setup_db.sh verify
```

## Regras de migration

### NUNCA fazer em produção

```sql
-- Bloqueia a tabela inteira!
ALTER TABLE posts ADD COLUMN score INTEGER NOT NULL DEFAULT 0;

-- Bloqueia escritas durante horas!
CREATE INDEX idx_posts_score ON posts(score);
```

### SEMPRE usar expand-contract

```sql
-- Passo 1: Adicionar nullable (sem lock)
ALTER TABLE posts ADD COLUMN score INTEGER;

-- Passo 2: Índice sem bloquear
CREATE INDEX CONCURRENTLY idx_posts_score ON posts(score);

-- Passo 3: Backfill em batches
UPDATE posts SET score = 0 WHERE id IN (
  SELECT id FROM posts WHERE score IS NULL LIMIT 10000
);
-- Repetir até score IS NULL = 0

-- Passo 4 (semana seguinte): Adicionar NOT NULL
ALTER TABLE posts ALTER COLUMN score SET NOT NULL;
```

### Checklist antes de cada migration em produção

- [ ] Testada em staging com dump anonimizado de produção
- [ ] EXPLAIN ANALYZE confirma que nenhuma query ficou mais lenta
- [ ] Não usa ALTER TABLE bloqueante em tabelas grandes
- [ ] Índices criados com CREATE INDEX CONCURRENTLY
- [ ] Plano de rollback definido
- [ ] Executar fora das horas de pico (3h–6h UTC)
- [ ] Monitorização Datadog activa durante a migration

## Tabelas — resumo dos 32

| Domínio | Tabelas |
|---|---|
| Utilizadores (6) | users, user_profiles, user_preferences, user_devices, user_sessions, follows |
| Roteiros (5) | itineraries, itinerary_days, itinerary_activities, itinerary_collaborators, itinerary_carbon |
| Social (6) | posts, post_media, comments, reactions, saves, reports |
| Gamificação (6) | badges, challenges, user_badges, user_challenges, streaks, leaderboard_entries |
| IA & ML (6) | prompt_versions, ai_generations, itinerary_edits, feed_interactions, packing_lists, location_crowding_stats |
| Sistema (4) | notifications, audit_logs, feature_flags, trip_expenses |

## Variáveis de ambiente

```env
# .env.development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=memovoy_dev
DB_USER=memovoy
DB_PASSWORD=memovoy_dev_password
DB_POOL_MIN=2
DB_POOL_MAX=10

# Não commitar .env com credenciais reais
```

## Notas importantes

- **UUID v7**: todas as PKs usam `generate_ulid()` (pg_idkit). Time-ordered + opaco.
- **TIMESTAMPTZ**: todos os timestamps em UTC. Conversão para timezone do utilizador no frontend.
- **Soft deletes**: `deleted_at` em todo o conteúdo. Nunca DELETE físico em produção.
- **Contadores desnormalizados**: `likes_count`, `follower_count`, etc. mantidos por triggers.
- **audit_logs**: append-only por trigger. Nem admins podem alterar.
- **feed_interactions**: TimescaleDB hypertable — não fazer queries sem filtro de data.
- **RLS**: activado em tabelas sensíveis. O API layer define `app.current_user_id` por transacção.
