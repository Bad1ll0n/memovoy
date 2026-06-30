// src/workers/feed-aggregator.js
// Worker de agregação periódica.
//
// Responsabilidades:
//   1. Recalcular leaderboard mensal (diariamente às 3h UTC)
//   2. Refrescar user_stats MATERIALIZED VIEW (a cada 5 minutos)
//   3. Limpar notificações lidas antigas (semanalmente)
//   4. Agregar crowding stats de actividades (a cada hora)
//
// Corre como processo separado: node src/workers/feed-aggregator.js
// Em produção seria gerido pelo Kubernetes CronJob ou PM2.

import postgres from 'postgres'
import { config } from '../config/index.js'

const sql = postgres(config.db?.url ?? process.env.DATABASE_URL, {
  max:          2,
  idle_timeout: 60,
  onnotice:     () => {},
})

// ---------------------------------------------------------------------------
// Scheduler simples baseado em intervalos
// ---------------------------------------------------------------------------

class Scheduler {
  constructor() {
    this.jobs = []
  }

  every(intervalMs, name, fn) {
    this.jobs.push({ intervalMs, name, fn, lastRun: 0 })
    return this
  }

  async run() {
    console.log(`[Aggregator] Iniciado com ${this.jobs.length} jobs`)

    while (true) {
      const now = Date.now()

      for (const job of this.jobs) {
        if (now - job.lastRun >= job.intervalMs) {
          job.lastRun = now
          runJob(job.name, job.fn)
        }
      }

      // Verificar a cada 10 segundos
      await sleep(10_000)
    }
  }
}

// Executar job com logging e error handling isolado
async function runJob(name, fn) {
  const start = Date.now()
  try {
    const result = await fn()
    const duration = Date.now() - start
    console.log(`[${name}] ✓ ${duration}ms${result ? ` — ${JSON.stringify(result)}` : ''}`)
  } catch (err) {
    console.error(`[${name}] ✗ ${err.message}`)
  }
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

// Job 1: Refrescar MATERIALIZED VIEW de estatísticas de utilizadores
// Executado a cada 5 minutos — CONCURRENTLY não bloqueia leituras
async function refreshUserStats() {
  await sql`SELECT refresh_user_stats()`
  return null
}

// Job 2: Recalcular leaderboard mensal
// Executado uma vez por dia — idempotente (ON CONFLICT DO UPDATE)
async function recalculateLeaderboard() {
  const [result] = await sql`
    SELECT COUNT(*) AS updated FROM (
      INSERT INTO leaderboard_entries
        (user_id, leaderboard_type, period_start, score, rank)
      SELECT
        i.user_id,
        'global_trips',
        date_trunc('month', NOW())::date,
        COUNT(*)::integer AS score,
        ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC)::integer AS rank
      FROM itineraries i
      WHERE i.status = 'published'
        AND i.deleted_at IS NULL
        AND i.published_at >= date_trunc('month', NOW())
      GROUP BY i.user_id
      ON CONFLICT (user_id, leaderboard_type, period_start)
        WHERE scope_id IS NULL
      DO UPDATE SET
        score      = EXCLUDED.score,
        rank       = EXCLUDED.rank,
        updated_at = NOW()
      RETURNING 1
    ) AS t
  `
  return { leaderboard_entries: parseInt(result.updated) }
}

// Job 3: Limpar notificações lidas antigas
// Executado semanalmente — usa a função criada na V15
async function cleanOldNotifications() {
  const [result] = await sql`SELECT cleanup_old_notifications(90) AS deleted`
  return { deleted: result.deleted }
}

// Job 4: Agregar crowding stats de actividades com coordenadas geo
// Alimenta a funcionalidade de previsão de affluência
async function aggregateCrowdingStats() {
  // Calcular actividades mais populares por geohash + dia da semana + hora
  const [result] = await sql`
    INSERT INTO location_crowding_stats
      (location_geo_hash, day_of_week, hour_of_day, avg_crowding_score,
       sample_count, last_updated)
    SELECT
      -- Geohash de 7 chars: precisão ~150m
      ST_GeoHash(a.location::geometry, 7)     AS location_geo_hash,
      EXTRACT(DOW  FROM d.date)::integer       AS day_of_week,
      EXTRACT(HOUR FROM a.start_time::time)::integer AS hour_of_day,
      -- Score baseado em número de roteiros que incluem este local
      COUNT(DISTINCT d.itinerary_id)::float    AS avg_crowding_score,
      COUNT(*)::integer                        AS sample_count,
      NOW()                                    AS last_updated
    FROM itinerary_activities a
    JOIN itinerary_days d ON d.id = a.day_id
    JOIN itineraries i    ON i.id = d.itinerary_id
    WHERE a.location IS NOT NULL
      AND a.start_time IS NOT NULL
      AND i.status = 'published'
      AND i.deleted_at IS NULL
      -- Apenas actividades dos últimos 2 anos para relevância
      AND i.start_date >= NOW() - INTERVAL '2 years'
    GROUP BY
      ST_GeoHash(a.location::geometry, 7),
      EXTRACT(DOW  FROM d.date),
      EXTRACT(HOUR FROM a.start_time::time)
    HAVING COUNT(*) >= 3  -- mínimo de amostras para fiabilidade
    ON CONFLICT (location_geo_hash, day_of_week, hour_of_day)
    DO UPDATE SET
      avg_crowding_score = EXCLUDED.avg_crowding_score,
      sample_count       = EXCLUDED.sample_count,
      last_updated       = NOW()
    RETURNING 1
  `
  return { crowding_entries_updated: result?.length ?? 0 }
}

// Job 5: Actualizar contadores desnormalizados (follower_count, etc.)
// Verificação de consistência — os triggers deviam manter isto actualizado,
// mas este job reconcilia qualquer discrepância acumulada
async function reconcileCounters() {
  // Reconciliar follower_count
  const [followers] = await sql`
    WITH correct_counts AS (
      SELECT
        following_id AS user_id,
        COUNT(*)     AS correct_count
      FROM follows
      WHERE status = 'active'
      GROUP BY following_id
    )
    UPDATE users u
    SET follower_count = cc.correct_count
    FROM correct_counts cc
    WHERE u.id = cc.user_id
      AND u.follower_count != cc.correct_count
    RETURNING 1
  `

  // Reconciliar total_trips em user_profiles
  const [trips] = await sql`
    WITH correct_trips AS (
      SELECT
        user_id,
        COUNT(*) AS correct_count
      FROM itineraries
      WHERE status = 'published' AND deleted_at IS NULL
      GROUP BY user_id
    )
    UPDATE user_profiles up
    SET total_trips = ct.correct_count
    FROM correct_trips ct
    WHERE up.user_id = ct.user_id
      AND up.total_trips != ct.correct_count
    RETURNING 1
  `

  return {
    followers_fixed: followers?.length ?? 0,
    trips_fixed:     trips?.length ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Configurar e arrancar
// ---------------------------------------------------------------------------

const MS = {
  seconds: (n) => n * 1000,
  minutes: (n) => n * 60 * 1000,
  hours:   (n) => n * 60 * 60 * 1000,
  days:    (n) => n * 24 * 60 * 60 * 1000,
}

new Scheduler()
  .every(MS.minutes(5),  'refresh-user-stats',       refreshUserStats)
  .every(MS.hours(1),    'recalculate-leaderboard',  recalculateLeaderboard)
  .every(MS.hours(1),    'aggregate-crowding',        aggregateCrowdingStats)
  .every(MS.days(1),     'clean-notifications',       cleanOldNotifications)
  .every(MS.hours(6),    'reconcile-counters',        reconcileCounters)
  .run()
  .catch((err) => {
    console.error('[Aggregator] Erro fatal:', err)
    process.exit(1)
  })

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Aggregator] SIGTERM — a fechar…')
  await sql.end()
  process.exit(0)
})

process.on('SIGINT', async () => {
  await sql.end()
  process.exit(0)
})

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
