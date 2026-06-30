# MemoVoy — Travel Social Network

## O que é
Rede social de viagens que combina partilha de roteiros (manuais e gerados por IA), feed social, gamificação e perfis de viajantes. Lançamento inicial em Portugal e Brasil.

## Stack tecnológico
- **Web**: Next.js 15 + TypeScript
- **iOS**: Swift + SwiftUI
- **Android**: Kotlin + Jetpack Compose
- **API**: Node.js (Fastify) ou Go
- **Base de dados**: PostgreSQL 16 + PostGIS + TimescaleDB
- **Cache**: Redis Cluster
- **Search**: Elasticsearch
- **Queue**: Apache Kafka
- **Storage**: AWS S3 / Cloudflare R2
- **IA**: Anthropic API (claude-sonnet-4-6) — JSON mode
- **Infra**: Kubernetes + AWS/GCP
- **Monitoring**: Datadog + Sentry
- **Migrations**: Flyway (expand-contract pattern)

## Extensões PostgreSQL obrigatórias
```sql
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_idkit";    -- UUID v7
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "timescaledb";
```

## Decisões de arquitetura fixas
- **UUID v7** como primary key em todas as tabelas (via pg_idkit)
- **TIMESTAMPTZ** em todos os timestamps, nunca TIMESTAMP
- **GEOGRAPHY(POINT, 4326)** para coordenadas GPS (PostGIS)
- **Soft deletes** com `deleted_at TIMESTAMPTZ` em todo o conteúdo
- **db_region** em users para data residency (EU: Frankfurt, BR: São Paulo)
- **Contadores desnormalizados** via triggers (likes_count, follower_count, etc.)
- **Expand-contract** para todas as migrations em produção
- **CREATE INDEX CONCURRENTLY** sempre — nunca bloquear tabelas

## Domínios do schema (28 tabelas)
1. **Utilizadores**: users, user_profiles, user_preferences, user_devices, user_sessions, follows
2. **Roteiros**: itineraries, itinerary_days, itinerary_activities, itinerary_collaborators
3. **Social**: posts, post_media, comments, reactions, saves, reports
4. **Gamificação**: challenges, user_challenges, badges, user_badges, streaks, leaderboard_entries
5. **IA & ML**: ai_generations, itinerary_edits, feed_interactions, prompt_versions
6. **Sistema**: notifications, audit_logs, feature_flags

## Roadmap de MVP
- **v1.0 (Mês 1–3)**: Auth, perfil, roteiro manual, feed básico, feedback in-app
- **v1.1 (Mês 4–6)**: Wizard IA, seguir utilizadores, desafios, pesquisa, notificações geo
- **v2.0 (Mês 7–12)**: Colaboração real-time, modo offline, integrações externas, monetização

## Feature flags activas
- `FEATURE_AI_ITINERARY` — geração de roteiros com IA
- `FEATURE_GEO_NOTIFICATIONS` — notificações por geolocalização
- `FEATURE_COLLAB_ITINERARY` — edição colaborativa (v2.0)
- `FEATURE_BOOKING_INTEGRATION` — integração Booking.com (v2.0)

## Regras de código
- Nunca armazenar email em claro — usar email_hash para lookup, email_encrypted para armazenar
- Nunca expor UUIDs internos em URLs públicas sem validação de ownership
- Todos os endpoints de escrita requerem autenticação JWT válido
- Rate limiting em todas as rotas públicas
- Logs estruturados em JSON com trace_id, user_id (nunca PII)
- Soft deletes em todo o conteúdo — nunca DELETE físico em produção

## SLOs por serviço
| Serviço | Uptime | p99 latência |
|---|---|---|
| Feed API | 99.9% | 200ms |
| Auth API | 99.95% | 300ms |
| Geração IA | 99.5% | 20s |
| Upload fotos | 99.9% | 10s |

## Contacto / Docs
- Schema validado: ver `docs/schema_v2.html`
- Roadmap completo: ver `docs/roadmap.html`
- Security: security.memovoy.com
