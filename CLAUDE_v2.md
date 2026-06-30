# MemoVoy — Travel Social Network

## O que é
Rede social de viagens que combina partilha de roteiros (manuais e gerados por IA), feed social, gamificação, expense tracker, packing list IA, calculador de carbono e perfis de viajantes. Lançamento inicial em Portugal e Brasil.

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
- **Taxas de câmbio**: BCE API (gratuita, TTL 6h no Redis)
- **Previsão do tempo**: OpenWeatherMap API (packing list)
- **Certificate pinning**: iOS URLSession delegate + Android OkHttp CertificatePinner

## Extensões PostgreSQL obrigatórias
```sql
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_idkit";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "timescaledb";
```

## Decisões de arquitetura fixas
- UUID v7 como PK em todas as tabelas (via pg_idkit)
- TIMESTAMPTZ em todos os timestamps, nunca TIMESTAMP
- GEOGRAPHY(POINT, 4326) para coordenadas GPS
- Soft deletes com deleted_at TIMESTAMPTZ em todo o conteúdo
- db_region em users para data residency (EU: Frankfurt, BR: São Paulo)
- Contadores desnormalizados via triggers
- Expand-contract para migrations em produção
- CREATE INDEX CONCURRENTLY sempre
- Gastos sempre em moeda original (amount_cents + currency) — converter só na apresentação
- Certificate pinning com 2 pins (atual + backup) — rotação 90 dias antes da expiração

## Schema — 32 tabelas em 6 domínios
1. **Utilizadores** (7): users, user_profiles, user_preferences, user_devices, user_sessions, follows
2. **Roteiros** (5): itineraries, itinerary_days, itinerary_activities, itinerary_collaborators, itinerary_carbon
3. **Social** (6): posts, post_media, comments, reactions, saves, reports
4. **Gamificação** (6): challenges, user_challenges, badges, user_badges, streaks, leaderboard_entries
5. **IA & ML** (6): ai_generations, itinerary_edits, feed_interactions, prompt_versions, packing_lists, location_crowding_stats
6. **Sistema** (4): notifications, audit_logs, feature_flags, trip_expenses

## Funcionalidades IA
- Geração de roteiros com wizard de 6 etapas (destino/datas → tipo → transporte → grupo → preferências → resumo)
- Adaptação por grupo (solo/casal/amigos/família) e transporte (pé/público/carro/bici/táxi/tour)
- Validação pós-geração: distâncias, horários, avisos, affluência prevista
- Packing list contextualizada (destino + atividades + previsão do tempo + tipo de grupo)
- Recomendações de feed por collaborative filtering
- Reconhecimento de destinos em fotos (visão computacional)
- Travel assistant chatbot com RAG contextualizado no roteiro ativo
- Diário automático pós-viagem (fotos + roteiro + gastos reais)
- Feedback loop: itinerary_edits → melhoria de prompts
- A/B testing via prompt_versions.traffic_percentage (validado por trigger)
- Fallback graceful a 3 níveis (real-time → cache Redis → modo manual)
- Previsão de affluência por local e hora (dados comunidade + Google Places)
- Calculador de pegada de carbono automático por roteiro

## Dark mode
- 3 modos: system (CSS prefers-color-scheme / iOS traitCollection) | manual | auto_time (21h-7h)
- Guardado em user_preferences.theme VARCHAR(20) CHECK IN ('system','light','dark','auto_time')
- CSS variables para theming na web; ColorScheme environment no iOS; MaterialTheme no Android

## Segurança mobile
- Certificate pinning: 2 pins SHA-256 (atual + backup) em iOS e Android
- Rotação: 90 dias antes → alerta; 60 dias → nova versão com ambos os pins; dia da rotação → trocar certificado; 30 dias depois → remover pin antigo
- Gestão de sessões: ecrã de dispositivos ativos com revogação individual e "revogar todas"
- Sessões suspeitas (is_suspicious=true) destacadas com aviso e email automático

## Roadmap MVP
- v1.0 (Mês 1–3): Auth, perfil, roteiro manual, feed básico, expense tracker, feedback in-app
- v1.1 (Mês 4–6): Wizard IA, packing list, seguir utilizadores, desafios, notificações geo, carbono
- v2.0 (Mês 7–12): Colaboração real-time, affluência ML, modo offline, integrações externas, monetização

## Feature flags
- FEATURE_AI_ITINERARY — geração de roteiros com IA
- FEATURE_GEO_NOTIFICATIONS — notificações por geolocalização
- FEATURE_COLLAB_ITINERARY — edição colaborativa (v2.0)
- FEATURE_BOOKING_INTEGRATION — integração Booking.com (v2.0)
- FEATURE_CARBON_CALCULATOR — calculador de carbono
- FEATURE_CROWDING_PREDICTIONS — previsão de affluência (requer >50k roteiros)

## SLOs por serviço
| Serviço | Uptime | p99 latência |
|---|---|---|
| Feed API | 99.9% | 200ms |
| Auth API | 99.95% | 300ms |
| Geração IA | 99.5% | 20s |
| Upload fotos | 99.9% | 10s |
| Expense tracker | 99.9% | 150ms |

## Regras de código
- Nunca armazenar email em claro — email_hash para lookup, email_encrypted para guardar
- Gastos em amount_cents (INTEGER) na moeda original — nunca floats para dinheiro
- Taxas de câmbio guardadas no registo (exchange_rate) — a taxa muda diariamente
- Certificate pinning: nunca fazer deploy sem testar pin em staging primeiro
- audit_logs é append-only — trigger impede UPDATE e DELETE
- prompt_versions: trigger valida que soma de traffic_percentage = 100
- location_crowding_stats: não mostrar dados com sample_size < 10
