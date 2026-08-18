# MemoVoy — contexto para agentes

Ler o `README.md` primeiro. Este ficheiro cobre só o que costuma induzir em erro.

## O produto chama-se MemoVoy

Não "Insight" nem "Roteiros". MemoVoy é o que o utilizador vê: assunto dos
emails, cabeçalho da marca, `PRODID` da exportação iCal, emissor do TOTP, nome
do ficheiro de exportação de dados, banner de arranque da API.

As pastas chamavam-se `insight-api`/`insight-web` até 2026-08-18; foram
renomeadas para condizer. O que ainda não condiz: a pasta local
(`Project_Roteiros`) e a base de dados (`insight`).

O repositório no GitHub chama-se `memovoy` e está certo — não sugerir renomeá-lo.

Ao adicionar texto visível ao utilizador, usar MemoVoy.

## Uma app, uma base de dados

`memovoy-api/` + `memovoy-web/` → BD **`insight`**. É tudo o que existe.

Até 2026-08-18 havia também uma app Express+EJS na raiz, ligada à BD `Roteiro`.
Foi removida: essa base de dados já não existe na máquina, logo a app não
arrancava. Se encontrares referências a `server.js`, `controllers/`, `views/` ou
`db/` na raiz, são de documentação desactualizada — o código está no histórico,
em `7b6ebdd`.

## Migrations

Runner próprio em `memovoy-api/src/db/migrate.js`, não Flyway. Ficheiros
`NNN_nome.sql` aplicados por ordem alfabética, cada um numa transação, com
registo em `_migrations`. Uma migration nova é um ficheiro novo com o número
seguinte — nunca editar uma já aplicada.

Como cada ficheiro corre dentro de `BEGIN`/`COMMIT`, `CREATE INDEX
CONCURRENTLY` **falha** aqui (não pode correr em transação).

## `.archive/` não é verdade actual

Contém docs de uma estrutura anterior que também usava o prefixo `memovoy-`,
mas com quatro pastas — `memovoy-{api,web,android,ios}`. Não confundir com as
duas de hoje. Descrevem PostGIS, TimescaleDB,
Kafka, Elasticsearch, Kubernetes, Flyway e UUID v7 via `pg_idkit` — nada disso
está construído. O que existe é PostgreSQL com `pgcrypto`, `pg_trgm`,
`pg_partman`, e UUID v4 via `gen_random_uuid()`. Tratar como intenção histórica.

## Segredos

`.env` está gitignored em todos os níveis e nunca entrou no histórico. Manter
assim: ao adicionar variáveis, actualizar `memovoy-api/.env.example` com a chave
e um valor vazio, nunca o valor real.

## Estado da qualidade

`npm test` corre em ambas as apps: 58 testes na API (node:test nativo) e 48 na
web (vitest). Nenhum toca na BD nem faz rede — as variáveis falsas de que a API
precisa estão em `memovoy-api/test/test.env`.

Ao mexer em `aiAgent.js`, `totp.js`, na validação de uploads, no hashing de
passwords ou no cliente HTTP do frontend, correr os testes: são essas as zonas
cobertas.

Testes com DOM usam jsdom e @testing-library/react — declarar
`// @vitest-environment jsdom` no topo do ficheiro, porque o ambiente por
omissão é Node. Só `useTheme` e `useEstaAoVivo` estão cobertos assim; não há
testes end-to-end.

O lint tem 11 erros por resolver (10 `set-state-in-effect`, 1 `refs`) e corre
sem bloquear — não bloquear PRs com isso até estar limpo.

As dependências estão sem vulnerabilidades conhecidas nas duas apps. Confirmar
com `npm audit` antes de subir versões.

Ficheiros grandes que convém partir antes de crescerem mais:
`memovoy-api/src/routes/itineraries.js` (1477 linhas),
`services/aiAgent.js` (717), `routes/users.js` (665), `routes/auth.js` (529).

## Next.js 16

`memovoy-web/AGENTS.md` avisa que esta versão tem breaking changes face ao que
está em treino. Consultar `node_modules/next/dist/docs/` antes de escrever
código de framework.
