# MemoVoy

Rede social de viagens: feed, roteiros gerados por IA, mensagens em tempo real,
grupos, despesas partilhadas, mapas, rankings e gamificação.

- **`memovoy-api/`** — API Fastify 5, na base de dados `memovoy`
- **`memovoy-web/`** — frontend Next.js 16

Tudo se chama MemoVoy: as pastas, a base de dados, o bucket S3, o repositório,
e o que o utilizador vê nos emails e na exportação iCal.

## Stack real

- **API** — Fastify 5, ESM, Node 22. JWT (access + refresh), Socket.IO com
  adapter Redis, pg-boss para jobs, OpenTelemetry, TOTP, web-push, S3/MinIO.
- **Web** — Next.js 16 (App Router), React 19, Tailwind 4, TanStack Query,
  Zustand, next-intl, Leaflet.
- **Base de dados** — PostgreSQL. Extensões: `pgcrypto`, `pg_trgm`,
  `pg_partman`. PKs em `UUID` via `gen_random_uuid()`.
- **Migrations** — runner próprio (`src/db/migrate.js`): ficheiros `.sql`
  numerados aplicados por ordem, cada um numa transação, registados na tabela
  `_migrations`. Não é Flyway.

## Arrancar

```bash
cd memovoy-api && npm install && cp .env.example .env
```

Preencher `.env` — no mínimo `DATABASE_URL`, `JWT_SECRET` e `JWT_REFRESH_SECRET`
(a API recusa arrancar sem os dois segredos). `REDIS_URL` é opcional: sem ele o
Socket.IO corre em modo single-node.

```bash
npm run migrate
npm run dev
```

A API sobe em `http://localhost:4000`. Para storage local de uploads,
`docker compose up -d` em `memovoy-api/` levanta MinIO em `:9000` (consola `:9001`).

```bash
cd memovoy-web && npm install && npm run dev
```

O frontend sobe em `http://localhost:3000` e lê `NEXT_PUBLIC_API_URL` de
`.env.local`.

## Testes

```bash
cd memovoy-api && npm test    # 58 testes (node:test)
cd memovoy-web && npm test    # 48 testes (vitest)
```

106 testes ao todo, a correr em poucos segundos. Nenhum precisa de
PostgreSQL, Redis ou chaves de API — cobrem lógica pura: sanitização das
saídas de IA, TOTP contra os vectores do RFC 6238, validação de magic bytes
nos uploads, hashing de passwords, configuração de JWT, o cliente HTTP com o
refresh em 401, e as stores.

A cobertura de componentes é mínima — só os hooks `useTheme` e
`useEstaAoVivo`. Não há testes
end-to-end. Aí a rede de segurança é o `tsc --noEmit` e o `next build`.

O CI (`.github/workflows/ci.yml`) corre tudo isto. O lint corre em modo
informativo — tem 11 erros por resolver e por isso ainda não bloqueia.

## Rotas da API

`/auth` `/users` `/posts` `/feed` `/itineraries` `/conversations` `/messages`
`/notifications` `/search` `/explore` `/rankings` `/map` `/bookmarks` `/uploads`
`/expenses` `/packing` `/groups` `/reports`

---

## Notas

- Uma app **Express 4 + EJS** vivia na raiz (`server.js`, `controllers/`,
  `views/`, `routes/`) e foi removida a 2026-08-18. Ligava-se à base de dados
  `Roteiro`, que já não existe na máquina — não conseguia arrancar. Fica no
  histórico: `git show 7b6ebdd:server.js`, ou
  `git checkout 7b6ebdd -- views/ controllers/ routes/` para a repor.
- **`.archive/`** guarda documentação da estrutura `memovoy-*` anterior e os
  diffs por commitar de worktrees de agentes já removidos. É referência
  histórica: descreve uma arquitectura planeada (Kubernetes, Kafka,
  Elasticsearch, TimescaleDB, Flyway, UUID v7) que **não** corresponde ao que
  está construído.
- O lint do frontend tem 11 erros por resolver; o CI corre-o sem bloquear.
