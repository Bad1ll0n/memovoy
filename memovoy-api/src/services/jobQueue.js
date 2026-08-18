// pg-boss ships as CJS — use createRequire for reliable ESM interop.
// v12 exports { PgBoss } as a named export; require('pg-boss') without
// destructuring returned the module object and threw
// "PgBoss is not a constructor" — silently, because the caller swallows the
// error in a .catch.
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { PgBoss } = require('pg-boss')

// Dot, not colon: v12 validates the queue name and rejects ':'.
export const JOB_AI_GENERATE = 'ai.generate-itinerary'

let boss = null

export async function startJobQueue(connectionString) {
  boss = new PgBoss({
    connectionString,
    schema:         'pgboss',
    archiveCompletedAfterSeconds: 60 * 60 * 24 * 7, // keep 7 days
    deleteAfterDays: 14,
    monitorStateIntervalSeconds: 60,
  })

  boss.on('error', (err) => console.error('[pg-boss]', err.message))
  await boss.start()

  // Since v10 queues are not created automatically: without this, both work()
  // and send() fail with "Queue ... does not exist". Idempotent.
  await boss.createQueue(JOB_AI_GENERATE)

  console.info('[pg-boss] Job queue started')
  return boss
}

export function getJobQueue() {
  return boss
}

/**
 * Register the AI generation worker.
 * @param {PgBoss} bossInstance
 * @param {{ io: import('socket.io').Server }} deps
 */
export async function registerWorkers(bossInstance, { io }) {
  const { query }                    = await import('../db/pool.js')
  const { agentValidateDestination, agentGenerateDays, agentGenerateTips } = await import('./aiAgent.js')
  const { checkItineraryBadges }     = await import('./badges.js')

  await bossInstance.work(JOB_AI_GENERATE, { teamSize: 2, teamConcurrency: 2 }, async (job) => {
    const { userId, params } = job.data

    async function notifyUser(event, data) {
      io?.to(`user:${userId}`).emit('itinerary:job', { jobId: job.id, event, ...data })
    }

    try {
      await notifyUser('status', { step: 1, message: 'A validar destino…' })

      let destinationMeta
      try {
        destinationMeta = await agentValidateDestination(params.destination)
      } catch (err) {
        await notifyUser('error', { message: err.message })
        throw err
      }
      await notifyUser('status', { step: 1, message: `Destino confirmado: ${destinationMeta.normalizedName}` })

      await notifyUser('status', { step: 2, message: 'A gerar itinerário…' })
      const { rows: prefRows } = await query(
        `SELECT chosen_activity->>'type' AS type, COUNT(*) AS cnt
         FROM activity_feedback
         WHERE user_id = $1 AND chosen_activity->>'type' IS NOT NULL
         GROUP BY type ORDER BY cnt DESC LIMIT 3`,
        [userId],
      )
      const userPreferences = prefRows.map((r) => r.type)

      const daysData = await agentGenerateDays({
        destination:   destinationMeta.normalizedName,
        country:       destinationMeta.country,
        language:      destinationMeta.language,
        currency:      destinationMeta.currency,
        startDate:     params.startDate,
        endDate:       params.endDate,
        groupType:     params.groupType,
        travelStyle:   params.travelStyle,
        mealsIncluded: params.mealsIncluded,
        transport:     params.transport,
        extras:        params.extras,
        budget:        params.budget,
        userPreferences,
      })

      await notifyUser('status', {
        step: 2,
        message: 'Itinerário gerado!',
        summary: daysData.summary,
        totalEstimatedCost: daysData.totalEstimatedCost,
      })

      await notifyUser('status', { step: 3, message: 'A gerar dicas locais…' })
      const tipsData = await agentGenerateTips({
        destination: destinationMeta.normalizedName,
        country:     destinationMeta.country,
        groupType:   params.groupType,
        travelStyle: params.travelStyle,
      })

      const title = `${destinationMeta.normalizedName} — ${params.startDate}`
      const data  = {
        normalizedName:     destinationMeta.normalizedName,
        country:            destinationMeta.country,
        continent:          destinationMeta.continent,
        language:           destinationMeta.language,
        currency:           destinationMeta.currency,
        timezone:           destinationMeta.timezone,
        bestTimeToVisit:    destinationMeta.bestTimeToVisit,
        quickFacts:         destinationMeta.quickFacts,
        summary:            daysData.summary ?? null,
        totalEstimatedCost: daysData.totalEstimatedCost ?? null,
        days:               daysData.days ?? [],
        tips:               tipsData,
      }

      const { rows } = await query(
        `INSERT INTO itineraries
          (user_id, title, destination, country, continent, start_date, end_date,
           group_type, travel_style, transport, budget, data, ai_generated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, TRUE)
         RETURNING id`,
        [
          userId, title,
          destinationMeta.normalizedName, destinationMeta.country, destinationMeta.continent,
          params.startDate, params.endDate,
          params.groupType, JSON.stringify(params.travelStyle), JSON.stringify(params.transport),
          params.budget, JSON.stringify(data),
        ],
      )

      query('UPDATE users SET score = score + 10 WHERE id = $1', [userId]).catch(() => {})
      checkItineraryBadges(userId).catch(() => {})

      await notifyUser('done', { id: rows[0].id })
    } catch (err) {
      console.error(`[pg-boss] ${JOB_AI_GENERATE} failed`, err.message)
      await notifyUser('error', { message: 'Erro ao gerar o roteiro. Tenta novamente.' }).catch(() => {})
      throw err
    }
  })

  console.info('[pg-boss] Worker registered:', JOB_AI_GENERATE)
}
