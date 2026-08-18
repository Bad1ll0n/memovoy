# Project Roteiros — contexto para agentes

Ler o `README.md` primeiro. Este ficheiro cobre só o que costuma induzir em erro.

## Duas apps, duas bases de dados

- `insight-api/` + `insight-web/` → BD **`insight`**. É onde o trabalho acontece.
- Raiz (`server.js`, `controllers/`, `routes/`, `views/`, `db/`, `config/`) →
  BD **`Roteiro`**. App Express+EJS anterior, independente.

Os nomes de tabela repetem-se entre as duas (`users`, `posts`, `itineraries`).
Antes de mexer em SQL, confirmar a qual das apps pertence o ficheiro. `db/` na
raiz é da legacy; `insight-api/migrations/` é da actual.

## Migrations

Runner próprio em `insight-api/src/db/migrate.js`, não Flyway. Ficheiros
`NNN_nome.sql` aplicados por ordem alfabética, cada um numa transação, com
registo em `_migrations`. Uma migration nova é um ficheiro novo com o número
seguinte — nunca editar uma já aplicada.

Como cada ficheiro corre dentro de `BEGIN`/`COMMIT`, `CREATE INDEX
CONCURRENTLY` **falha** aqui (não pode correr em transação).

## `.archive/` não é verdade actual

Contém docs da estrutura `memovoy-*` anterior. Descrevem PostGIS, TimescaleDB,
Kafka, Elasticsearch, Kubernetes, Flyway e UUID v7 via `pg_idkit` — nada disso
está construído. O que existe é PostgreSQL com `pgcrypto`, `pg_trgm`,
`pg_partman`, e UUID v4 via `gen_random_uuid()`. Tratar como intenção histórica.

## Segredos

`.env` está gitignored em todos os níveis e nunca entrou no histórico. Manter
assim: ao adicionar variáveis, actualizar `insight-api/.env.example` com a chave
e um valor vazio, nunca o valor real.

## Estado da qualidade

`npm test` corre em ambas as apps: 58 testes na API (node:test nativo) e 40 na
web (vitest). Nenhum toca na BD nem faz rede — as variáveis falsas de que a API
precisa estão em `insight-api/test/test.env`.

Ao mexer em `aiAgent.js`, `totp.js`, na validação de uploads, no hashing de
passwords ou no cliente HTTP do frontend, correr os testes: são essas as zonas
cobertas.

Testes com DOM usam jsdom e @testing-library/react — declarar
`// @vitest-environment jsdom` no topo do ficheiro, porque o ambiente por
omissão é Node. Só `useTheme` está coberto assim; não há testes end-to-end.

O lint tem 12 erros por
resolver (10 `set-state-in-effect`, 1 `purity`, 1 `refs`) e corre sem bloquear
— não bloquear PRs com isso até estar limpo.

As dependências estão sem vulnerabilidades conhecidas nas duas apps. Confirmar
com `npm audit` antes de subir versões.

Ficheiros grandes que convém partir antes de crescerem mais:
`insight-api/src/routes/itineraries.js` (1477 linhas),
`services/aiAgent.js` (717), `routes/users.js` (665), `routes/auth.js` (529).

## Next.js 16

`insight-web/AGENTS.md` avisa que esta versão tem breaking changes face ao que
está em treino. Consultar `node_modules/next/dist/docs/` antes de escrever
código de framework.
