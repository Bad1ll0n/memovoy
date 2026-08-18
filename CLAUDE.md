# MemoVoy — contexto para agentes

Ler o `README.md` primeiro. Este ficheiro cobre só o que costuma induzir em erro.

## O produto chama-se MemoVoy

Não "Insight" nem "Roteiros". MemoVoy é o que o utilizador vê: assunto dos
emails, cabeçalho da marca, `PRODID` da exportação iCal, emissor do TOTP, nome
do ficheiro de exportação de dados, banner de arranque da API.

A 2026-08-18 tudo foi alinhado com o nome do produto: as pastas chamavam-se
`insight-api`/`insight-web`, a base de dados `insight` e o bucket S3
`insight-uploads`. Se encontrares `insight` em algum lado, é resíduo.

O repositório no GitHub chama-se `memovoy` e está certo — não sugerir renomeá-lo.

Ao adicionar texto visível ao utilizador, usar MemoVoy.

## Uma app, uma base de dados

`memovoy-api/` + `memovoy-web/` → BD **`memovoy`**. É tudo o que existe.

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

## Docs antigos descrevem coisas que não existem

Se desenterrares documentação do histórico — havia uma pasta `.archive/`,
removida em 2026-08-18 — não a tomes por verdade. Descrevia PostGIS,
TimescaleDB, Kafka, Elasticsearch, Kubernetes, Flyway e UUID v7 via `pg_idkit`,
nada disso construído. O que existe é PostgreSQL com `pgcrypto`, `pg_trgm` e
`pg_partman`, e UUID v4 via `gen_random_uuid()`.

## Segredos

`.env` está gitignored em todos os níveis e nunca entrou no histórico. Manter
assim: ao adicionar variáveis, actualizar `memovoy-api/.env.example` com a chave
e um valor vazio, nunca o valor real.

## Estado da qualidade

`npm test` corre os unitários em ambas as apps: 58 na API (node:test nativo,
`test/unit/`) e 48 na web (vitest). Não tocam na BD nem fazem rede.

`npm run test:integration` corre 104 testes contra Postgres a sério
(`test/integration/`), via `app.inject()`. **A app é construída por
`src/app.js`**, que devolve a instância Fastify sem a pôr à escuta;
`src/server.js` é só o ponto de entrada que a levanta e liga Socket.IO e a fila
de jobs. Rotas novas registam-se em `app.js`.

Os dois conjuntos vivem em pastas separadas porque a descoberta automática do
`node --test` apanharia os de integração ao correr `npm test` — daí os globs
explícitos nos scripts.

Os de integração correm com `--test-concurrency=1`. Partilham uma base de dados
e cada ficheiro limpa a tabela `users` no `beforeEach`; em paralelo, limpavam-se
uns aos outros a meio. Ao acrescentar ficheiros novos, manter assim.

Ao mexer em `aiAgent.js`, `totp.js`, na validação de uploads, no hashing de
passwords, nas rotas de autenticação ou no cliente HTTP do frontend, correr os
testes: são essas as zonas cobertas.

Testes com DOM usam jsdom e @testing-library/react — declarar
`// @vitest-environment jsdom` no topo do ficheiro, porque o ambiente por
omissão é Node. Só `useTheme` e `useEstaAoVivo` estão cobertos assim; não há
testes end-to-end.

O lint **bloqueia no CI** e está limpo: zero erros, zero avisos. Manter assim —
se um aviso novo aparecer, resolvê-lo em vez de o deixar acumular.

Ler valores que só existem no cliente — `localStorage`, `navigator`, `window` —
faz-se com `useEstaHidratado()` ou `useValorDoCliente()` de
`@/hooks/useValorDoCliente`, não com estado sincronizado num `useEffect`. Há
duas excepções documentadas no código, ambas com `eslint-disable-next-line` e a
razão por escrito: o rascunho do wizard de roteiros (estado editável, e ler
durante o render daria mismatch de hidratação) e o `SocketProvider` (expor um
recurso externo criado no efeito). Se acrescentares outra, justifica-a igual.

As dependências estão sem vulnerabilidades conhecidas nas duas apps. Confirmar
com `npm audit` antes de subir versões.

Ficheiros grandes que convém partir antes de crescerem mais:
`memovoy-api/src/routes/itineraries.js` (1477 linhas),
`services/aiAgent.js` (717), `routes/users.js` (665), `routes/auth.js` (529).

## Next.js 16

`memovoy-web/AGENTS.md` avisa que esta versão tem breaking changes face ao que
está em treino. Consultar `node_modules/next/dist/docs/` antes de escrever
código de framework.
