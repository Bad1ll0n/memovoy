# MemoVoy — CLAUDE.md
> Documento de referência para o assistente IA. Actualizado em 2026-06-28.
> Contém o estado completo do projecto e convenções a seguir em futuras sessões.

---

## O que é o MemoVoy

Rede social de viagens com lançamento simultâneo em Portugal e Brasil.
Funcionalidades core: feed social, roteiros manuais e gerados por IA (wizard 6 etapas),
gamificação (badges, desafios, streaks, leaderboard), expense tracker, packing list IA,
calculador de pegada de carbono, certificate pinning nas apps, RLS na BD.

---

## Stack completa

| Camada | Tecnologia |
|---|---|
| Base de dados | PostgreSQL 16 + PostGIS + TimescaleDB, Flyway |
| API | Node.js 22 (ESM), Fastify 4, postgres.js, Zod, argon2id |
| iOS | SwiftUI, actor-based APIClient, Keychain, certificate pinning |
| Android | Jetpack Compose, Hilt, Ktor + OkHttp, DataStore, Turbine |
| Web | Next.js 15, TanStack Query v5, Zustand, Tailwind CSS 3 |
| IA | Anthropic Claude Sonnet 4.6 (wizard + packing list) |

---

## Estado actual (v1.0 completo)

### Base de dados
- **17 migrations Flyway** (V1–V17), 32 tabelas, score 10/10 após auditorias iterativas
- ZIP: `memovoy_final_v17.zip`
- Extensões: PostGIS, pg_idkit (UUID v7), pg_trgm, btree_gin, pgcrypto, TimescaleDB
- RLS activo em todas as tabelas relevantes via `current_user_id()` helper
- `audit_logs` como hypertable TimescaleDB (chunks mensais, retenção 7 anos)
- `user_stats` como MATERIALIZED VIEW com `REFRESH CONCURRENTLY`

### API Fastify
- **50 endpoints** em 10 módulos, 27 ficheiros, 5.556 linhas
- ZIP: `memovoy-api-v5.zip` (última versão completa)
- Módulos: auth, users, itineraries, feed, posts, ai/wizard, notifications, expenses, packing, gamification
- Porta 3000 em desenvolvimento
- Testes unitários: `src/auth/auth.service.test.js`, `src/ai/prompt-builder.test.js`
- Testes de integração: `src/tests/integration/` (requerem BD real)

### iOS SwiftUI
- **14 ficheiros**, 4.953 linhas
- ZIP: `memovoy-ios-v2.zip`
- Actor-based APIClient com certificate pinning (2 SHA-256 pins, desactivado em DEBUG)
- Refresh automático com CheckedContinuation para serializar requests concorrentes
- Keychain com `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`
- Ecrãs: Landing, Login, Register, Feed, Explore, Itineraries (lista + detalhe + mapa), Profile, Wizard (6 etapas), Notifications, Expenses, Sessions

### Android Jetpack Compose
- **14 ficheiros**, 4.334 linhas
- ZIP: `memovoy-android-v2.zip`
- Hilt DI, StateFlow + SharedFlow, Ktor/OkHttp com CertificatePinner (desactivado em DEBUG)
- DataStore para tokens (nunca SharedPreferences)
- `AsyncImage` via Coil, `PullToRefreshContainer` Material 3
- Testes: Turbine + Mockito-Kotlin para ViewModels
- Ecrãs: Landing, Login, Register, Feed, Itineraries, Notifications, Profile (com badges/desafios), Wizard (6 etapas + AnimatedContent slide)

### Next.js 15 Web
- **20 ficheiros**, 3.778 linhas
- ZIP: `memovoy-web-v2.zip`
- Porta 3001 em desenvolvimento
- TanStack Query v5 com `useInfiniteQuery` e cursor pagination
- Zustand auth store com `persist` (nunca guarda access token em localStorage)
- `api-client.ts`: refresh automático, serialização de refreshes concorrentes
- Páginas: Landing, Login, Register, Feed (infinite scroll + optimistic likes), Explore (grelha + filtro por país), Itineraries (lista + detalhe com accordion + wizard 6 etapas), Profile (`[userId]` com tabs posts/badges/desafios), Notifications (optimistic mark-as-read)
- Design: Playfair Display (display) + Inter (body), paleta #185FA5/#0F6E50/#EF9F27

---

## Convenções de código

### Geral
- Erros tipados em vez de strings genéricas
- Fire-and-forget para operações não críticas (impressões de feed, gamificação após publish)
- Soft delete em todas as entidades de utilizador (`deleted_at TIMESTAMPTZ`)
- `withUser(userId, role, fn)` **obrigatório** em qualquer query que precise de RLS
- Nunca `SELECT *` — sempre colunas explícitas

### API (Node.js)
- Lógica de negócio em `*.service.js`, routing em `*.routes.js`
- Validação Zod no início da rota — service recebe dados já validados
- Capturar erro `23505` da BD como `ConflictError`, não verificar antes com SELECT
- Todos os endpoints de escrita dentro de `withUser()` para RLS automático
- Rate limiting configurado por endpoint com `config: { rateLimit: { ... } }`

### iOS (Swift)
- `@MainActor` em todos os `ObservableObject` que mutam `@Published`
- `actor` para `APIClient` e `TokenStore` — sem locks manuais
- `CheckedContinuation` para serializar requests concorrentes de refresh
- Certificate pinning: dois pins SHA-256, desactivado em `#if DEBUG`

### Android (Kotlin)
- `StateFlow` para estado UI (observado com `collectAsStateWithLifecycle`)
- `SharedFlow` para eventos one-shot (navegação, erros)
- `update { copy(...) }` para mutações de estado — nunca mutação directa
- `LazyVerticalGrid` com altura fixa quando dentro de `ScrollColumn` — evita conflito
- `CertificatePinner` desactivado em `BuildConfig.DEBUG`

### Web (Next.js)
- `'use client'` apenas nas páginas/componentes com interactividade
- `useInfiniteQuery` com `getNextPageParam` devolvendo `undefined` (não `null`) quando não há mais
- Optimistic updates: `cancelQueries` → `setQueryData` → rollback no `onError` → `invalidateQueries` no `onSettled`
- Auth guard via `useEffect` com `isHydrated` — evita flash de redirect
- Imagens externas: declarar em `next.config.ts` `remotePatterns`

---

## Variáveis de ambiente necessárias (API)

```env
DATABASE_URL=postgresql://memovoy:pass@localhost:5432/memovoy_dev
JWT_ACCESS_SECRET=<64 bytes hex>
JWT_REFRESH_SECRET=<64 bytes hex diferente>
EMAIL_ENCRYPTION_KEY=<32 bytes base64>
ANTHROPIC_API_KEY=sk-ant-...
```

Gerar secrets:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## Arranque em desenvolvimento

```bash
# 1. BD + Redis
docker compose up db redis -d

# 2. Migrations
./setup_db.sh migrate

# 3. API (porta 3000)
cd memovoy-api && npm install && npm run dev

# 4. Web (porta 3001)
cd memovoy-web && npm install && npm run dev
```

---

## Testes

```bash
# Unit tests (sem BD)
npm test

# Integration tests (requerem BD)
DATABASE_URL=postgresql://... npm run test:integration

# Todos os testes
DATABASE_URL=postgresql://... npm run test:all
```

---

## Próximos passos (roadmap pós-v1.0)

- [ ] Push notifications reais (FCM + APNs worker)
- [ ] Kafka consumer para fan-out do feed
- [ ] Redis cache para feed discovery e top countries
- [ ] Moderação de conteúdo (worker que processa `moderation_status = 'pending'`)
- [ ] Elasticsearch para pesquisa full-text de roteiros
- [ ] App Store / Google Play submission
- [ ] CI/CD (GitHub Actions → Kubernetes)
- [ ] Deployment infrastructure (Terraform + AWS)

---

## Ficheiros de output disponíveis

| Ficheiro | Conteúdo |
|---|---|
| `memovoy_final_v17.zip` | 17 migrations SQL + setup_db.sh |
| `memovoy-api-v5.zip` | API Fastify completa (50 endpoints) |
| `memovoy-ios-v2.zip` | App iOS SwiftUI (14 ficheiros) |
| `memovoy-android-v2.zip` | App Android Compose (14 ficheiros) |
| `memovoy-web-v2.zip` | Frontend Next.js 15 (20 ficheiros) |
