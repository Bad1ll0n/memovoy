/**
 * Semeia a base de dados de TESTE com volume realista, para o teste de carga
 * medir alguma coisa.
 *
 * A primeira corrida do teste de carga foi contra uma base de dados vazia, o
 * que torna os números quase inúteis: sem publicações, o /feed cai no caminho
 * de conteúdo curado e corre uma segunda query, e as tabelas vazias escondem
 * exactamente os problemas que a carga devia revelar.
 *
 * Correr:  npm run carga:semear
 *          npm run carga:semear -- --posts 5000
 *
 * Apaga e recria tudo. Só aponta para a base de dados de teste.
 */

process.env.LOG_SLOW_QUERIES = 'false'

import { query, pool } from '../../src/db/pool.js'

const args = new Map()
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1])
}

const UTILIZADORES = Number(args.get('utilizadores') ?? 200)
const POSTS        = Number(args.get('posts') ?? 2000)
const GOSTOS       = Number(args.get('gostos') ?? 30_000)
const COMENTARIOS  = Number(args.get('comentarios') ?? 8000)
const SEGUIDORES   = Number(args.get('seguidores') ?? 4000)

// Salvaguarda: isto apaga tudo, e não pode acontecer numa base de dados que não
// seja a de teste.
const url = process.env.DATABASE_URL ?? ''
if (!/memovoy_test/.test(url)) {
  console.error('RECUSADO: DATABASE_URL não aponta para memovoy_test.')
  console.error(`  aponta para: ${url.replace(/:[^:@]*@/, ':***@')}`)
  process.exit(1)
}

console.log('A limpar…')
await query('TRUNCATE users CASCADE')

console.log(`A criar ${UTILIZADORES} utilizadores…`)
// generate_series em vez de N inserts: semear em ciclo demorava minutos e a
// pool passava o tempo a receber uma linha de cada vez.
await query(
  `INSERT INTO users (username, email, password_hash, display_name)
   SELECT 'carga' || i, 'carga' || i || '@exemplo.pt', 'x', 'Carga ' || i
   FROM generate_series(1, $1) AS i`,
  [UTILIZADORES],
)

console.log(`A criar ${POSTS} publicações…`)
// O mesmo LATERAL não correlacionado que estragou os gostos estava aqui, e
// escapou-me na primeira correcção: as 2000 publicações saíram todas com o
// mesmo autor. Um feed em que toda a gente segue a mesma pessoa não mede nada
// do que se quer medir.
await query(
  `WITH u AS (SELECT array_agg(id ORDER BY id) AS a FROM users)
   INSERT INTO posts (user_id, caption, images, destination, created_at)
   SELECT
     u.a[1 + floor(random() * array_length(u.a, 1))::int],
     'Publicação de carga número ' || i,
     '["/carga.jpg"]'::jsonb,
     (ARRAY['Lisboa','Porto','Faro','Braga','Évora'])[1 + (i % 5)],
     NOW() - (i || ' minutes')::interval
   FROM generate_series(1, $1) AS i, u`,
  [POSTS],
)

// Os ids vêm para arrays e a distribuição é feita por aritmética sobre o índice
// da série.
//
// A primeira versão usava CROSS JOIN LATERAL (... OFFSET floor(random()*N)
// LIMIT 1). O LATERAL não referenciava a linha de fora, por isso o planeador
// avaliou-o UMA vez: as 30 000 linhas de gostos saíram todas com o mesmo par e
// colapsaram em 1 no ON CONFLICT, e os 8000 comentários foram todos parar à
// mesma publicação. Referenciar `i` é o que torna o LATERAL correlacionado.
//
// A distribuição é enviesada de propósito. Espalhar os gostos por igual dava a
// cada publicação ~15, e é justamente a publicação com centenas que faz o
// produto cartesiano do /feed doer. Metade vai para 10% das publicações.
//
// O índice vem de random() na lista do SELECT, onde é volátil e avaliado por
// linha. A segunda tentativa usou aritmética modular sobre `i` e tinha período:
// o par (publicação, utilizador) só tomava 2000 valores distintos e 30 000
// gostos colapsavam em 1100.

console.log(`A criar ${GOSTOS} gostos…`)
await query(
  `WITH p AS (SELECT array_agg(id ORDER BY created_at DESC) AS a FROM posts),
        u AS (SELECT array_agg(id ORDER BY id) AS a FROM users)
   INSERT INTO post_likes (post_id, user_id)
   SELECT
     -- Metade concentrada nos 10% mais recentes, metade espalhada.
     CASE WHEN i % 2 = 0
       THEN p.a[1 + floor(random() * GREATEST(1, array_length(p.a, 1) / 10))::int]
       ELSE p.a[1 + floor(random() * array_length(p.a, 1))::int]
     END,
     u.a[1 + floor(random() * array_length(u.a, 1))::int]
   FROM generate_series(1, $1) AS i, p, u
   ON CONFLICT DO NOTHING`,
  [GOSTOS],
)

console.log(`A criar ${COMENTARIOS} comentários…`)
await query(
  `WITH p AS (SELECT array_agg(id ORDER BY created_at DESC) AS a FROM posts),
        u AS (SELECT array_agg(id ORDER BY id) AS a FROM users)
   INSERT INTO post_comments (post_id, user_id, content)
   SELECT
     CASE WHEN i % 2 = 0
       THEN p.a[1 + floor(random() * GREATEST(1, array_length(p.a, 1) / 10))::int]
       ELSE p.a[1 + floor(random() * array_length(p.a, 1))::int]
     END,
     u.a[1 + floor(random() * array_length(u.a, 1))::int],
     'Comentário de carga ' || i
   FROM generate_series(1, $1) AS i, p, u`,
  [COMENTARIOS],
)

console.log(`A criar ${SEGUIDORES} relações de seguidor…`)
// Os pares são calculados numa CTE e só depois filtrados. Pôr random() na lista
// do SELECT e outra vez no WHERE dava dois valores diferentes, e o filtro de
// auto-seguimento não filtrava nada.
await query(
  `WITH u AS (SELECT array_agg(id ORDER BY id) AS a FROM users),
        pares AS (
          SELECT u.a[1 + floor(random() * array_length(u.a, 1))::int] AS seguidor,
                 u.a[1 + floor(random() * array_length(u.a, 1))::int] AS seguido
          FROM generate_series(1, $1) AS i, u
        )
   INSERT INTO follows (follower_id, following_id)
   SELECT seguidor, seguido FROM pares
   WHERE seguidor <> seguido
   ON CONFLICT DO NOTHING`,
  [SEGUIDORES],
)

// Sem isto o planeador trabalha com estatísticas de uma tabela vazia e escolhe
// planos que não têm nada a ver com os que escolheria em produção — o que
// tornaria a medição seguinte uma ficção.
console.log('ANALYZE…')
await query('ANALYZE')

console.log('\nVolume final:')
for (const t of ['users', 'posts', 'post_likes', 'post_comments', 'follows']) {
  const { rows } = await query(`SELECT COUNT(*)::int AS n FROM ${t}`)
  console.log(`  ${t.padEnd(15)} ${rows[0].n}`)
}

const { rows: dist } = await query(
  'SELECT COUNT(DISTINCT user_id)::int AS autores FROM posts',
)
console.log(`  autores distintos  ${dist[0].autores}`)
if (dist[0].autores < UTILIZADORES / 2) {
  console.error('')
  console.error('AVISO: as publicações estão concentradas em poucos autores.')
  console.error('       A distribuição colapsou — os números de carga não valem nada assim.')
}

await pool.end()
