# Project Roteiros

Monorepo com **duas aplicações independentes**, em bases de dados separadas.

| | Pasta | Stack | Base de dados | Estado |
|---|---|---|---|---|
| **Insight** (actual) | `insight-api/`, `insight-web/` | Fastify 5 + Next.js 16 | `insight` | Em desenvolvimento activo |
| **Roteiros** (legacy) | raiz: `server.js`, `controllers/`, `views/` | Express 4 + EJS | `Roteiro` | Anterior; destino por decidir |

As duas não partilham dados. Os nomes de tabela sobrepõem-se (`users`, `posts`,
`itineraries`, `post_likes`, `post_comments`) mas vivem em bases de dados
distintas — a Insight é uma reescrita de raiz, não uma extensão da legacy.

---

## Insight — a aplicação actual

Rede social de viagens: feed, roteiros gerados por IA, mensagens em tempo real,
grupos, despesas partilhadas, mapas, rankings e gamificação.

### Stack real

- **API** — Fastify 5, ESM, Node 22. JWT (access + refresh), Socket.IO com
  adapter Redis, pg-boss para jobs, OpenTelemetry, TOTP, web-push, S3/MinIO.
- **Web** — Next.js 16 (App Router), React 19, Tailwind 4, TanStack Query,
  Zustand, next-intl, Leaflet.
- **Base de dados** — PostgreSQL. Extensões: `pgcrypto`, `pg_trgm`,
  `pg_partman`. PKs em `UUID` via `gen_random_uuid()`.
- **Migrations** — runner próprio (`src/db/migrate.js`): ficheiros `.sql`
  numerados aplicados por ordem, cada um numa transação, registados na tabela
  `_migrations`. Não é Flyway.

### Arrancar

```bash
cd insight-api && npm install && cp .env.example .env
```

Preencher `.env` — no mínimo `DATABASE_URL`, `JWT_SECRET` e `JWT_REFRESH_SECRET`
(a API recusa arrancar sem os dois segredos). `REDIS_URL` é opcional: sem ele o
Socket.IO corre em modo single-node.

```bash
npm run migrate
npm run dev
```

A API sobe em `http://localhost:4000`. Para storage local de uploads,
`docker compose up -d` em `insight-api/` levanta MinIO em `:9000` (consola `:9001`).

```bash
cd insight-web && npm install && npm run dev
```

O frontend sobe em `http://localhost:3000` e lê `NEXT_PUBLIC_API_URL` de
`.env.local`.

### Testes

```bash
cd insight-api && npm test    # 58 testes (node:test)
cd insight-web && npm test    # 33 testes (vitest)
```

91 testes ao todo, a correr em cerca de um segundo. Nenhum precisa de
PostgreSQL, Redis ou chaves de API — cobrem lógica pura: sanitização das
saídas de IA, TOTP contra os vectores do RFC 6238, validação de magic bytes
nos uploads, hashing de passwords, configuração de JWT, o cliente HTTP com o
refresh em 401, e as stores.

Não há testes de componentes React nem end-to-end. Aí a rede de segurança é
o `tsc --noEmit` e o `next build`.

O CI (`.github/workflows/ci.yml`) corre tudo isto. O lint corre em modo
informativo — tem 15 erros por resolver e por isso ainda não bloqueia.

### Rotas da API

`/auth` `/users` `/posts` `/feed` `/itineraries` `/conversations` `/messages`
`/notifications` `/search` `/explore` `/rankings` `/map` `/bookmarks` `/uploads`
`/expenses` `/packing` `/groups` `/reports`

---

## Roteiros — a aplicação legacy

Express 4 + EJS + Passport (sessões), na raiz do repositório. Lê as variáveis
`DB_*` do `.env` da raiz e liga-se à base de dados `Roteiro`.

```bash
npm install && npm run dev
```

`Scripts/` contém scripts de povoamento de dados (GeoNames, Foursquare) que
alimentaram esta base de dados.

---

## Notas

- **`.archive/`** guarda documentação da estrutura `memovoy-*` anterior e os
  diffs por commitar de worktrees de agentes já removidos. É referência
  histórica: descreve uma arquitectura planeada (Kubernetes, Kafka,
  Elasticsearch, TimescaleDB, Flyway, UUID v7) que **não** corresponde ao que
  está construído.
- O lint do frontend tem 15 erros por resolver; o CI corre-o sem bloquear.
