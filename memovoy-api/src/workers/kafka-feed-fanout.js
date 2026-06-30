// src/workers/kafka-feed-fanout.js
// Worker de fan-out do feed via Kafka.
//
// Arquitectura fan-out on write:
//   Quando um utilizador com < 10k seguidores publica um roteiro/post:
//   1. A API publica um evento no tópico 'post.published'
//   2. Este worker consome o evento
//   3. Insere o post no feed de cada seguidor (tabela feed_entries)
//
// Para utilizadores com >= 10k seguidores (influencers):
//   Fan-out on read — o feed é calculado em tempo real
//   (evitar escrever para 100k+ feeds por cada post)
//
// Sem Kafka real: corre em modo polling (consulta BD directamente).
// Com Kafka: substituir KafkaClientMock por @confluentinc/kafka-javascript.
//
// Nota: a tabela feed_entries é adicional ao schema actual.
// A V18 da BD adicionaria esta tabela para o fan-out.

import postgres from 'postgres'
import { config } from '../config/index.js'

const FANOUT_THRESHOLD    = 10_000   // utilizadores com > N seguidores usam fan-out on read
const BATCH_SIZE          = 100      // followers por batch de INSERT
const POLL_INTERVAL       = 5_000
const FANOUT_ENTRIES_TTL  = 30 * 24 * 60 * 60  // 30 dias em segundos (para limpeza)

const USE_KAFKA = process.env.KAFKA_BROKERS !== undefined
const KAFKA_BROKERS = process.env.KAFKA_BROKERS?.split(',') ?? []
const KAFKA_GROUP   = 'feed-fanout-workers'
const TOPIC_POSTS   = 'post.published'

const sql = postgres(config.db?.url ?? process.env.DATABASE_URL, {
  max: 5, idle_timeout: 60, onnotice: () => {},
})

// ---------------------------------------------------------------------------
// Kafka client — real ou mock
// ---------------------------------------------------------------------------

async function makeKafkaConsumer() {
  if (!USE_KAFKA) {
    console.log('[FanOut] Modo polling — sem Kafka. Para activar: definir KAFKA_BROKERS.')
    return null
  }

  // Em produção: usar @confluentinc/kafka-javascript ou kafkajs
  // const { Kafka } = await import('@confluentinc/kafka-javascript')
  // const kafka = new Kafka({ brokers: KAFKA_BROKERS, clientId: 'feed-fanout' })
  // const consumer = kafka.consumer({ groupId: KAFKA_GROUP })
  // await consumer.connect()
  // await consumer.subscribe({ topic: TOPIC_POSTS, fromBeginning: false })
  // return consumer

  console.log('[FanOut] Kafka configurado mas biblioteca não instalada — a usar polling.')
  return null
}

// ---------------------------------------------------------------------------
// Lógica de fan-out
// ---------------------------------------------------------------------------

// Decidir se deve fazer fan-out on write ou on read para este utilizador
async function shouldFanout(userId) {
  const [user] = await sql`
    SELECT follower_count FROM users WHERE id = ${userId} LIMIT 1
  `
  return (user?.follower_count ?? 0) < FANOUT_THRESHOLD
}

// Fazer fan-out para todos os seguidores em batches
async function fanoutPost(postId, authorId) {
  if (!(await shouldFanout(authorId))) {
    console.log(`[FanOut] Post ${postId}: autor tem >= ${FANOUT_THRESHOLD} seguidores → fan-out on read`)
    return { mode: 'on_read', fanout_count: 0 }
  }

  // Buscar todos os seguidores activos
  let offset = 0
  let totalFanout = 0

  while (true) {
    const followers = await sql`
      SELECT follower_id
      FROM follows
      WHERE following_id = ${authorId}
        AND status = 'active'
      ORDER BY created_at ASC
      LIMIT ${BATCH_SIZE}
      OFFSET ${offset}
    `

    if (followers.length === 0) break

    // Inserir em feed_entries para cada seguidor
    // ON CONFLICT DO NOTHING: idempotente se o worker processar o mesmo evento duas vezes
    const entries = followers.map((f) => ({
      user_id:     f.follower_id,
      post_id:     postId,
      author_id:   authorId,
      created_at:  new Date(),
    }))

    // Inserir apenas se a tabela existir (schema v18)
    try {
      await sql`
        INSERT INTO feed_entries ${sql(entries)}
        ON CONFLICT (user_id, post_id) DO NOTHING
      `
    } catch (err) {
      if (err.message.includes('does not exist')) {
        console.warn('[FanOut] Tabela feed_entries não existe — a usar fan-out on read. Aplicar V18.')
        return { mode: 'on_read', fanout_count: 0, reason: 'table_missing' }
      }
      throw err
    }

    totalFanout += followers.length
    offset += BATCH_SIZE

    if (followers.length < BATCH_SIZE) break

    // Pequena pausa entre batches para não sobrecarregar a BD
    await sleep(50)
  }

  return { mode: 'on_write', fanout_count: totalFanout }
}

// ---------------------------------------------------------------------------
// Modo polling (sem Kafka)
// ---------------------------------------------------------------------------

async function processPendingPosts() {
  // Buscar posts publicados recentemente sem fan-out registado
  // A coluna fanout_at seria adicionada na V18
  let processed = 0

  try {
    const posts = await sql`
      SELECT p.id, p.user_id, p.created_at
      FROM posts p
      WHERE p.deleted_at IS NULL
        AND p.visibility IN ('public', 'followers')
        AND p.created_at > NOW() - INTERVAL '1 hour'
        AND NOT EXISTS (
          SELECT 1 FROM feed_fanout_log fl WHERE fl.post_id = p.id
        )
      ORDER BY p.created_at ASC
      LIMIT 50
      FOR UPDATE OF p SKIP LOCKED
    `

    for (const post of posts) {
      const result = await fanoutPost(post.id, post.user_id)

      // Registar que foi processado
      await sql`
        INSERT INTO feed_fanout_log (post_id, fanout_count, mode, processed_at)
        VALUES (${post.id}, ${result.fanout_count}, ${result.mode}, NOW())
        ON CONFLICT (post_id) DO NOTHING
      `

      processed++
      console.log(`[FanOut] Post ${post.id}: ${result.mode}, ${result.fanout_count} entradas`)
    }
  } catch (err) {
    if (err.message.includes('does not exist')) {
      // Tabelas de fan-out não existem ainda — silencioso até aplicar V18
      return 0
    }
    throw err
  }

  return processed
}

// ---------------------------------------------------------------------------
// Modo Kafka
// ---------------------------------------------------------------------------

async function runWithKafka(consumer) {
  console.log(`[FanOut] A consumir tópico '${TOPIC_POSTS}'`)

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const event = JSON.parse(message.value.toString())
        const { postId, authorId } = event

        if (!postId || !authorId) {
          console.warn('[FanOut] Evento inválido:', event)
          return
        }

        const result = await fanoutPost(postId, authorId)
        console.log(`[FanOut] Post ${postId}: ${result.mode}, ${result.fanout_count} entradas`)
      } catch (err) {
        console.error('[FanOut] Erro ao processar mensagem:', err.message)
        // Não fazer throw — Kafka fará retry automático
      }
    },
  })
}

// ---------------------------------------------------------------------------
// Cleanup de feed_entries antigas (chamado pelo feed-aggregator)
// ---------------------------------------------------------------------------

export async function cleanOldFeedEntries() {
  try {
    const [result] = await sql`
      DELETE FROM feed_entries
      WHERE created_at < NOW() - INTERVAL '30 days'
      RETURNING 1
    `
    return result?.length ?? 0
  } catch (err) {
    if (err.message.includes('does not exist')) return 0
    throw err
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function run() {
  console.log('[FanOut] Worker iniciado')

  const consumer = await makeKafkaConsumer()

  if (consumer) {
    await runWithKafka(consumer)
  } else {
    // Modo polling
    let idleCount = 0
    while (true) {
      try {
        const processed = await processPendingPosts()
        if (processed === 0) {
          idleCount++
          const delay = Math.min(POLL_INTERVAL * Math.pow(1.5, Math.min(idleCount, 4)), 30_000)
          await sleep(delay)
        } else {
          idleCount = 0
          await sleep(200)
        }
      } catch (err) {
        console.error('[FanOut] Erro no ciclo:', err.message)
        await sleep(POLL_INTERVAL)
      }
    }
  }
}

process.on('SIGTERM', async () => { await sql.end(); process.exit(0) })
process.on('SIGINT',  async () => { await sql.end(); process.exit(0) })

run().catch((err) => { console.error('[FanOut] Fatal:', err); process.exit(1) })

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }
