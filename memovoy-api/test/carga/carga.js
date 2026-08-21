/**
 * Teste de carga.
 *
 * Era a última área do relatório de QA por cobrir: 410 testes diziam que a app
 * está correcta, nenhum dizia como se porta com gente lá dentro ao mesmo tempo.
 *
 * Sem dependências de propósito. O autocannon trazia três vulnerabilidades
 * moderadas para um projecto que tem zero, e um gerador de carga é isto — um
 * ciclo de pedidos, um relógio e um histograma.
 *
 * Correr:  npm run carga
 *          npm run carga -- --ligacoes 100 --segundos 20
 *
 * Aponta para a base de dados de TESTE e cria os seus próprios utilizadores.
 * Não toca em dados reais.
 */

// Silenciar o registo de queries lentas antes de importar o pool: durante a
// carga são milhares de linhas e afogam o relatório, que é o que interessa.
process.env.LOG_SLOW_QUERIES = 'false'

import { buildApp } from '../../src/app.js'

const args = new Map()
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1])
}

const LIGACOES = Number(args.get('ligacoes') ?? 50)
const SEGUNDOS = Number(args.get('segundos') ?? 10)

/** Percentil de uma lista já ordenada. */
function percentil(ordenadas, p) {
  if (ordenadas.length === 0) return 0
  const i = Math.min(ordenadas.length - 1, Math.ceil((p / 100) * ordenadas.length) - 1)
  return ordenadas[i]
}

function formatar(ms) {
  return `${ms.toFixed(1).padStart(7)} ms`
}

/**
 * Martela um cenário durante o tempo dado com N pedidos simultâneos.
 * @returns {Promise<{nome: string, total: number, erros: number, recusados: number, estados: Record<number, number>, duracoes: number[]}>}
 */
async function medir(nome, disparar) {
  const duracoes = []
  const estados = {}
  let erros = 0
  let recusados = 0
  const fim = Date.now() + SEGUNDOS * 1000

  async function trabalhador() {
    while (Date.now() < fim) {
      const t0 = performance.now()
      try {
        const res = await disparar()
        duracoes.push(performance.now() - t0)
        estados[res.statusCode] = (estados[res.statusCode] ?? 0) + 1
        // 503 é o under-pressure a recusar trabalho de propósito — é o
        // sistema a funcionar, não a falhar. Só 5xx que não seja 503 conta.
        if (res.statusCode >= 500 && res.statusCode !== 503) erros++
        if (res.statusCode === 503) recusados++
      } catch {
        duracoes.push(performance.now() - t0)
        erros++
      }
    }
  }

  await Promise.all(Array.from({ length: LIGACOES }, trabalhador))

  duracoes.sort((a, b) => a - b)
  return { nome, total: duracoes.length, erros, recusados, estados, duracoes }
}

function relatar(r) {
  const rps = r.total / SEGUNDOS
  const media = r.duracoes.reduce((a, b) => a + b, 0) / (r.duracoes.length || 1)

  console.log(`\n── ${r.nome} ${'─'.repeat(Math.max(0, 56 - r.nome.length))}`)
  console.log(`   pedidos ${String(r.total).padStart(7)}   ${rps.toFixed(0).padStart(6)} req/s`)
  console.log(`   média   ${formatar(media)}`)
  console.log(`   p50     ${formatar(percentil(r.duracoes, 50))}`)
  console.log(`   p95     ${formatar(percentil(r.duracoes, 95))}`)
  console.log(`   p99     ${formatar(percentil(r.duracoes, 99))}`)
  console.log(`   máx     ${formatar(r.duracoes.at(-1) ?? 0)}`)
  console.log(`   estados ${JSON.stringify(r.estados)}${r.erros ? `   ERROS: ${r.erros}` : ''}`)
  if (r.recusados > 0) {
    const pct = ((r.recusados / r.total) * 100).toFixed(1)
    console.log(`   recusa  ${r.recusados} pedidos com 503 (${pct}%) — carga acima do que a máquina aguenta`)
  }
}

const app = (await buildApp({ rateLimit: false })).app
await app.ready()

// Uma conta a sério, para os cenários autenticados baterem no mesmo caminho
// que a app real — token, hook de last_seen, queries com o utilizador.
const registo = await app.inject({
  method: 'POST', url: '/auth/register',
  payload: {
    username: `carga${Date.now().toString(36)}`,
    email:    `carga${Date.now().toString(36)}@exemplo.pt`,
    password: 'PasswordDeCarga1',
  },
})
const { accessToken, user } = JSON.parse(registo.body)
const auth = { authorization: `Bearer ${accessToken}` }

// A conta passa a seguir gente e a ter gostos seus.
//
// Sem isto o feed dela vem vazio e a rota cai sempre no caminho de conteúdo
// curado — media-se o caminho excepcional e não o normal, e os números não
// dizem nada sobre o que as pessoas realmente vêem.
const { query } = await import('../../src/db/pool.js')
await query(
  `INSERT INTO follows (follower_id, following_id)
   SELECT $1, id FROM users WHERE id <> $1 ORDER BY id LIMIT 30
   ON CONFLICT DO NOTHING`,
  [user.id],
)
await query(
  `INSERT INTO post_likes (post_id, user_id)
   SELECT id, $1 FROM posts ORDER BY created_at DESC LIMIT 50
   ON CONFLICT DO NOTHING`,
  [user.id],
)

const { rows: comFeed } = await query(
  `SELECT COUNT(*)::int AS n FROM posts p
   WHERE p.user_id = $1 OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1)`,
  [user.id],
)
console.log(`
Conta de carga: ${comFeed[0].n} publicações no feed`)
if (comFeed[0].n === 0) {
  console.log('AVISO: feed vazio — o /feed vai medir o caminho de conteúdo curado.')
  console.log('       Correr `npm run carga:semear` primeiro.')
}

console.log(`\nCarga: ${LIGACOES} pedidos simultâneos, ${SEGUNDOS}s por cenário`)
console.log('Sem rate limit — o objectivo é medir a app, não o limitador.')

const cenarios = [
  // Referência: sem base de dados. Mede o custo do Fastify e do próprio teste.
  ['GET /health          (sem BD)',   () => app.inject({ method: 'GET', url: '/health' })],
  ['GET /feed            (auth, BD)', () => app.inject({ method: 'GET', url: '/feed', headers: auth })],
  ['GET /explore         (agregado)', () => app.inject({ method: 'GET', url: '/explore', headers: auth })],
  ['GET /notifications   (auth, BD)', () => app.inject({ method: 'GET', url: '/notifications', headers: auth })],
  ['GET /users/me        (auth, BD)', () => app.inject({ method: 'GET', url: '/users/me', headers: auth })],
]

const resultados = []
for (const [nome, disparar] of cenarios) {
  // Deixar o event loop assentar. Sem esta pausa, o under-pressure disparado
  // pelo cenário anterior ainda estava a recusar quando o seguinte começava, e
  // os números do segundo eram na verdade os do primeiro.
  await new Promise((r) => setTimeout(r, 2000))

  const r = await medir(nome, disparar)
  relatar(r)
  resultados.push(r)
}

const comErros = resultados.filter((r) => r.erros > 0)
console.log('\n' + '═'.repeat(60))
if (comErros.length > 0) {
  console.log(`FALHOU: ${comErros.length} cenário(s) com erros de servidor.`)
  for (const r of comErros) console.log(`  ${r.nome}: ${r.erros} erros`)
} else {
  console.log('Nenhum erro de servidor em nenhum cenário.')
}

await app.close()
process.exit(comErros.length > 0 ? 1 : 0)
