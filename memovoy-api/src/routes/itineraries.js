import { z } from 'zod'
import { query } from '../db/pool.js'
import { agentValidateDestination, agentGenerateDays, agentGenerateTips, agentSuggestActivity, agentStreamSuggestActivity, agentSuggestForDay, agentRecommendDuration, agentRefineDays, agentAdaptDayForWeather, agentMoodTrip } from '../services/aiAgent.js'

async function getUserPreferences(userId) {
  const { rows } = await query(
    `SELECT chosen_activity->>'type' AS type, COUNT(*) AS cnt
     FROM activity_feedback
     WHERE user_id = $1 AND chosen_activity->>'type' IS NOT NULL
     GROUP BY type ORDER BY cnt DESC LIMIT 3`,
    [userId],
  )
  return rows.map((r) => r.type)
}
import { checkItineraryBadges } from '../services/badges.js'
import { difundirNaSala } from '../services/socket.js'

const generateSchema = z.object({
  destination:    z.string().min(2).max(100),
  startDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  groupType:      z.string(),
  travelStyle:    z.array(z.string()).min(1),
  mealsIncluded:  z.array(z.string()).default([]),
  transport:      z.array(z.string()).default(['plane']),
  extras:         z.array(z.string()).default([]),
  budget:         z.number().min(0).default(1000),
})

function itiSummaryDto(row) {
  return {
    id:          row.id,
    title:       row.title,
    destination: row.destination,
    startDate:   row.start_date,
    endDate:     row.end_date,
    coverUrl:    row.cover_url,
    aiGenerated: row.ai_generated,
    savesCount:  Number(row.saves_count ?? 0),
    viewsCount:  Number(row.views_count ?? 0),
    daysCount:   Number(row.days_count ?? 0),
  }
}

export async function itinerariesRoutes(app) {
  // POST /itineraries/activity-feedback — save user's selected activity replacement
  app.post('/activity-feedback', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({
      itineraryId:     z.string().uuid().optional(),
      destination:     z.string().min(1).max(100),
      originalName:    z.string().max(200).optional(),
      feedback:        z.string().min(1).max(500),
      chosenName:      z.string().min(1).max(200),
      chosenActivity:  z.record(z.unknown()),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const { itineraryId, destination, originalName, feedback, chosenName, chosenActivity } = parsed.data

    await query(
      `INSERT INTO activity_feedback (user_id, itinerary_id, destination, original_name, feedback, chosen_name, chosen_activity)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [request.user.id, itineraryId ?? null, destination, originalName ?? null, feedback, chosenName, JSON.stringify(chosenActivity)],
    )

    return reply.status(201).send({ ok: true })
  })

  // POST /itineraries/suggest-by-mood — get destination suggestions from a vibe/mood description
  app.post('/suggest-by-mood', { preHandler: [app.authenticate], config: { rateLimit: { max: 15, timeWindow: '1 minute' } } }, async (request, reply) => {
    const schema = z.object({
      mood:      z.string().min(3).max(300),
      budget:    z.number().positive().optional(),
      month:     z.string().max(20).optional(),
      groupType: z.string().max(50).optional(),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    try {
      const result = await agentMoodTrip(parsed.data)
      return reply.send(result)
    } catch {
      return reply.status(500).send({ message: 'Erro ao processar a tua vibe. Tenta novamente.' })
    }
  })

  // POST /itineraries/recommend-duration
  app.post('/recommend-duration', { preHandler: [app.authenticate], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const schema = z.object({
      destination: z.string().min(1).max(100),
      travelStyle: z.array(z.string()).default([]),
      groupType:   z.string().default('couple'),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })
    try {
      const result = await agentRecommendDuration(parsed.data)
      return reply.send(result)
    } catch {
      return reply.status(500).send({ message: 'Erro ao calcular duração. Tenta novamente.' })
    }
  })

  // POST /itineraries — manual creation
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({
      title:       z.string().min(1).max(200),
      destination: z.string().min(1).max(100),
      startDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      endDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      data:        z.object({ days: z.array(z.unknown()).default([]) }),
    })

    const parsed = schema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.errors[0].message })
    }

    const { title, destination, startDate, endDate, data } = parsed.data

    const { rows } = await query(
      `INSERT INTO itineraries
        (user_id, title, destination, start_date, end_date, data, ai_generated)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE)
       RETURNING id`,
      [request.user.id, title, destination, startDate ?? null, endDate ?? null, JSON.stringify(data)],
    )

    // +10 score ao criar itinerário (fire-and-forget)
    query('UPDATE users SET score = score + 10 WHERE id = $1', [request.user.id]).catch(() => {})
    checkItineraryBadges(request.user.id).catch(() => {})

    return reply.status(201).send({ id: rows[0].id })
  })

  // POST /itineraries/generate-stream — AI generation with SSE streaming
  // Sends events: { event: 'status'|'day'|'done'|'error', data: {...} }
  app.post('/generate-stream', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = generateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.errors[0].message })
    }

    const params = parsed.data
    if (params.endDate < params.startDate) {
      return reply.status(400).send({ message: 'Data de fim deve ser posterior à data de início.' })
    }

    const ALLOWED_ORIGINS = new Set(
      (process.env.FRONTEND_URL ?? 'http://localhost:3000').split(',').map((o) => o.trim()),
    )
    const requestOrigin = request.headers.origin ?? ''
    const safeOrigin = ALLOWED_ORIGINS.has(requestOrigin) ? requestOrigin : (process.env.FRONTEND_URL ?? 'http://localhost:3000')
    reply.raw.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin':      safeOrigin,
      'Access-Control-Allow-Credentials': 'true',
    })

    const send = (event, data) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    try {
      // Step 1 — validate destination
      send('status', { step: 1, message: 'A validar destino…' })
      let destinationMeta
      try {
        destinationMeta = await agentValidateDestination(params.destination)
      } catch (err) {
        send('error', { message: err.message })
        reply.raw.end()
        return
      }
      send('status', { step: 1, message: `Destino confirmado: ${destinationMeta.normalizedName}` })

      // Step 2 — generate days (stream each day progressively)
      send('status', { step: 2, message: 'A gerar itinerário…' })
      const userPreferences = await getUserPreferences(request.user.id)
      const daysData = await agentGenerateDays({
        destination:     destinationMeta.normalizedName,
        country:         destinationMeta.country,
        language:        destinationMeta.language,
        currency:        destinationMeta.currency,
        startDate:       params.startDate,
        endDate:         params.endDate,
        groupType:       params.groupType,
        travelStyle:     params.travelStyle,
        mealsIncluded:   params.mealsIncluded,
        transport:       params.transport,
        extras:          params.extras,
        budget:          params.budget,
        userPreferences,
      })

      // Stream days one by one with a short delay so the UI reveals them progressively
      for (const day of (daysData.days ?? [])) {
        send('day', { day })
        await new Promise((r) => setTimeout(r, 120))
      }

      send('status', { step: 2, message: 'Itinerário gerado!', summary: daysData.summary, totalEstimatedCost: daysData.totalEstimatedCost })

      // Step 3 — generate tips
      send('status', { step: 3, message: 'A gerar dicas locais…' })
      const tipsData = await agentGenerateTips({
        destination: destinationMeta.normalizedName,
        country:     destinationMeta.country,
        groupType:   params.groupType,
        travelStyle: params.travelStyle,
      })

      const title = `${destinationMeta.normalizedName} — ${params.startDate}`
      const data = {
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
          request.user.id, title,
          destinationMeta.normalizedName, destinationMeta.country, destinationMeta.continent,
          params.startDate, params.endDate,
          params.groupType, JSON.stringify(params.travelStyle), JSON.stringify(params.transport),
          params.budget, JSON.stringify(data),
        ],
      )

      query('UPDATE users SET score = score + 10 WHERE id = $1', [request.user.id]).catch(() => {})
      checkItineraryBadges(request.user.id).catch(() => {})

      send('done', { id: rows[0].id, tips: tipsData })
    } catch (err) {
      console.error('[generate-stream]', err.message)
      send('error', { message: 'Erro ao gerar o roteiro. Tenta novamente.' })
    }

    reply.raw.end()
  })

  // POST /itineraries/generate — AI 3-step agent (non-streaming fallback)
  app.post('/generate', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = generateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.errors[0].message })
    }

    const params = parsed.data

    if (params.endDate < params.startDate) {
      return reply.status(400).send({ message: 'Data de fim deve ser posterior à data de início.' })
    }

    // Step 1 — validate destination
    let destinationMeta
    try {
      destinationMeta = await agentValidateDestination(params.destination)
    } catch (err) {
      return reply.status(422).send({ message: err.message })
    }

    // Step 2 — generate days
    const userPreferences2 = await getUserPreferences(request.user.id)
    let daysData
    try {
      daysData = await agentGenerateDays({
        destination:     destinationMeta.normalizedName,
        country:         destinationMeta.country,
        language:        destinationMeta.language,
        currency:        destinationMeta.currency,
        startDate:       params.startDate,
        endDate:         params.endDate,
        groupType:       params.groupType,
        travelStyle:     params.travelStyle,
        mealsIncluded:   params.mealsIncluded,
        transport:       params.transport,
        extras:          params.extras,
        budget:          params.budget,
        userPreferences: userPreferences2,
      })
    } catch {
      return reply.status(503).send({ message: 'Serviço de IA temporariamente indisponível. Tenta novamente em alguns segundos.' })
    }

    // Step 3 — generate tips
    let tipsData
    try {
      tipsData = await agentGenerateTips({
        destination: destinationMeta.normalizedName,
        country:     destinationMeta.country,
        groupType:   params.groupType,
        travelStyle: params.travelStyle,
      })
    } catch {
      tipsData = {}
    }

    const title = `${destinationMeta.normalizedName} — ${params.startDate}`

    const data = {
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
        request.user.id,
        title,
        destinationMeta.normalizedName,
        destinationMeta.country,
        destinationMeta.continent,
        params.startDate,
        params.endDate,
        params.groupType,
        JSON.stringify(params.travelStyle),
        JSON.stringify(params.transport),
        params.budget,
        JSON.stringify(data),
      ],
    )

    // +10 score ao criar itinerário IA (fire-and-forget)
    query('UPDATE users SET score = score + 10 WHERE id = $1', [request.user.id]).catch(() => {})
    checkItineraryBadges(request.user.id).catch(() => {})

    return reply.status(201).send({ id: rows[0].id })
  })

  // GET /itineraries/mine
  app.get('/mine', { preHandler: [app.authenticate] }, async (request, reply) => {
    const cursor = request.query.cursor
    const limit  = 10

    const { rows } = await query(
      `SELECT id, title, destination, start_date, end_date,
              ai_generated, saves_count, views_count, cover_url,
              COALESCE(jsonb_array_length(data->'days'), 0) AS days_count
       FROM itineraries
       WHERE user_id = $1
         AND ($2::uuid IS NULL OR created_at < (SELECT created_at FROM itineraries WHERE id = $2))
       ORDER BY created_at DESC
       LIMIT $3`,
      [request.user.id, cursor ?? null, limit + 1],
    )

    const hasMore = rows.length > limit
    const items   = rows.slice(0, limit)

    return reply.send({
      itineraries: items.map(itiSummaryDto),
      nextCursor:  hasMore ? items[items.length - 1].id : null,
    })
  })

  // GET /itineraries/:id
  app.get('/:id', async (request, reply) => {
    const viewerId = request.user?.id ?? null

    const { rows } = await query(
      `SELECT i.*,
        u.username, u.display_name, u.avatar_url,
        COALESCE(jsonb_array_length(i.data->'days'), 0) AS days_count,
        EXISTS(SELECT 1 FROM bookmarks WHERE itinerary_id = i.id AND user_id = $2) AS viewer_saved
       FROM itineraries i
       JOIN users u ON u.id = i.user_id
       WHERE i.id = $1 AND (i.is_public = TRUE OR i.user_id = $2)`,
      [request.params.id, viewerId],
    )

    if (rows.length === 0) return reply.status(404).send({ message: 'Roteiro não encontrado.' })

    const row  = rows[0]
    const data = row.data ?? {}

    // Increment view count (fire-and-forget)
    query('UPDATE itineraries SET views_count = views_count + 1 WHERE id = $1', [row.id]).catch(() => {})

    return reply.send({
      id:                 row.id,
      title:              row.title,
      destination:        row.destination,
      country:            row.country ?? data.country,
      continent:          row.continent ?? data.continent,
      language:           data.language,
      currency:           data.currency,
      timezone:           data.timezone,
      bestTimeToVisit:    data.bestTimeToVisit,
      quickFacts:         data.quickFacts ?? [],
      summary:            data.summary ?? null,
      totalEstimatedCost: data.totalEstimatedCost ?? null,
      groupType:          row.group_type,
      travelStyle:        row.travel_style ?? [],
      startDate:          row.start_date,
      endDate:            row.end_date,
      budget:             row.budget,
      aiGenerated:        row.ai_generated,
      days:               data.days ?? [],
      tips:               data.tips ?? null,
      savesCount:         Number(row.saves_count),
      viewsCount:         Number(row.views_count),
      viewerSaved:        row.viewer_saved ?? false,
      createdAt:          row.created_at,
      author: {
        id:        row.user_id,
        username:  row.username,
        avatarUrl: row.avatar_url,
      },
    })
  })

  // GET /itineraries/:id/export.ics — calendar export
  // Public itineraries: accessible without auth. Private: require auth and ownership.
  app.get('/:id/export.ics', async (request, reply) => {
    // Optional auth: signed-in users also see their own private itineraries,
    // anonymous ones see only public.
    //
    // Must be jwtVerify() directly. The app.authenticate decorator does not
    // throw on failure — it catches and replies 401 straight away — so the
    // catch here never fired and every anonymous request got a 401, even for a
    // public itinerary.
    try { await request.jwtVerify() } catch { /* anonymous — public only */ }
    const viewerId = request.user?.id ?? null

    const { rows } = await query(
      `SELECT i.title, i.destination, i.start_date, i.end_date, i.data, i.is_public, i.user_id
       FROM itineraries i
       WHERE i.id = $1`,
      [request.params.id],
    )

    if (rows.length === 0) return reply.status(404).send({ message: 'Roteiro não encontrado.' })

    const itinerary = rows[0]
    if (!itinerary.is_public && itinerary.user_id !== viewerId) {
      return viewerId
        ? reply.status(403).send({ message: 'Sem permissão para exportar este roteiro.' })
        : reply.status(401).send({ message: 'Autenticação necessária para exportar roteiros privados.' })
    }

    const row  = itinerary
    const data = row.data ?? {}
    const days = data.days ?? []

    function toIcsDate(dateStr, timeStr) {
      if (!dateStr) return null
      const [y, m, d]    = dateStr.split('-').map(Number)
      const [hh, mm]     = (timeStr ?? '09:00').split(':').map(Number)
      const pad = (n) => String(n).padStart(2, '0')
      return `${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00`
    }

    function escapeIcs(str) {
      return (str ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
    }

    const now    = new Date()
    const dtstamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

    const events = []
    for (const day of days) {
      for (const act of (day.activities ?? [])) {
        const dtStart = toIcsDate(day.date, act.time)
        if (!dtStart) continue
        const uid = `${request.params.id}-${day.day}-${act.time ?? ''}@memovoy`

        events.push([
          'BEGIN:VEVENT',
          `UID:${uid}`,
          `DTSTAMP:${dtstamp}`,
          `DTSTART:${dtStart}`,
          `SUMMARY:${escapeIcs(act.name)}`,
          act.description ? `DESCRIPTION:${escapeIcs(act.description)}` : null,
          act.address     ? `LOCATION:${escapeIcs(act.address)}` : null,
          'END:VEVENT',
        ].filter(Boolean).join('\r\n'))
      }
    }

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Memovoy//Travel Itinerary//PT',
      `X-WR-CALNAME:${escapeIcs(row.title ?? row.destination)}`,
      'X-WR-TIMEZONE:UTC',
      ...events,
      'END:VCALENDAR',
    ].join('\r\n')

    return reply
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="roteiro-${request.params.id}.ics"`)
      .send(ics)
  })

  // GET /itineraries?country=&limit=
  app.get('/', async (request, reply) => {
    const country = request.query.country
    const limit   = Math.min(Number(request.query.limit ?? 10), 50)

    const { rows } = await query(
      `SELECT id, title, destination
       FROM itineraries
       WHERE is_public = TRUE
         AND ($1::text IS NULL OR lower(country) = lower($1))
       ORDER BY created_at DESC
       LIMIT $2`,
      [country ?? null, limit],
    )

    return reply.send(rows.map((r) => ({ id: r.id, title: r.title, destination: r.destination })))
  })

  // POST /itineraries/suggest-for-day — AI suggests 3 activities for a day being built
  app.post('/suggest-for-day', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({
      destination:        z.string().min(1).max(100),
      dayNumber:          z.number().int().min(1),
      existingActivities: z.array(z.object({ name: z.string() })).default([]),
      currency:           z.string().min(1).max(5).default('EUR'),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.errors[0].message })
    }

    try {
      const prefs = await getUserPreferences(request.user.id)
      const result = await agentSuggestForDay({ ...parsed.data, userPreferences: prefs })
      return reply.send({ suggestions: result.suggestions ?? [] })
    } catch {
      return reply.status(500).send({ message: 'Erro ao gerar sugestões. Tenta novamente.' })
    }
  })

  // POST /itineraries/:id/suggest — AI suggests a replacement activity
  app.post('/:id/suggest', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({
      dayIndex:      z.number().int().min(0),
      activityIndex: z.number().int().min(0),
      feedback:      z.string().min(1).max(500),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.errors[0].message })
    }

    const { dayIndex, activityIndex, feedback } = parsed.data

    const { rows } = await query(
      "SELECT data, destination, data->>'currency' AS currency, user_id FROM itineraries WHERE id = $1",
      [request.params.id],
    )
    if (rows.length === 0) return reply.status(404).send({ message: 'Roteiro não encontrado.' })
    if (rows[0].user_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })

    const data = rows[0].data
    const day = data?.days?.[dayIndex]
    if (!day) return reply.status(400).send({ message: 'Dia inválido.' })
    const existingActivity = day.activities?.[activityIndex]
    if (!existingActivity) return reply.status(400).send({ message: 'Actividade inválida.' })

    const result = await agentSuggestActivity({
      destination: rows[0].destination,
      currency: rows[0].currency ?? data?.currency ?? 'EUR',
      existingActivity,
      feedback,
    })

    return reply.send({ suggestions: result.suggestions ?? [] })
  })

  // POST /itineraries/:id/suggest/stream — SSE streaming activity suggestions
  app.post('/:id/suggest/stream', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({
      dayIndex:      z.number().int().min(0),
      activityIndex: z.number().int().min(0),
      feedback:      z.string().min(1).max(500),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const { dayIndex, activityIndex, feedback } = parsed.data
    const { rows } = await query(
      "SELECT data, destination, data->>'currency' AS currency, user_id FROM itineraries WHERE id = $1",
      [request.params.id],
    )
    if (rows.length === 0) return reply.status(404).send({ message: 'Roteiro não encontrado.' })
    if (rows[0].user_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })

    const data = rows[0].data
    const existingActivity = data?.days?.[dayIndex]?.activities?.[activityIndex]
    if (!existingActivity) return reply.status(400).send({ message: 'Actividade inválida.' })

    // Load last 5 accepted activity replacements for personalised suggestions
    const { rows: histRows } = await query(
      `SELECT original_name, feedback, chosen_name, chosen_activity
       FROM activity_feedback
       WHERE user_id = $1 AND destination ILIKE $2
       ORDER BY created_at DESC LIMIT 5`,
      [request.user.id, rows[0].destination],
    )

    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')

    try {
      for await (const suggestion of agentStreamSuggestActivity({
        destination: rows[0].destination,
        currency:    rows[0].currency ?? data?.currency ?? 'EUR',
        existingActivity,
        feedback,
        feedbackHistory: histRows,
      })) {
        reply.raw.write(`data: ${JSON.stringify({ suggestion })}\n\n`)
      }
      reply.raw.write('data: [DONE]\n\n')
    } catch {
      reply.raw.write('data: {"error":true}\n\n')
    } finally {
      reply.raw.end()
    }
  })

  // GET /itineraries/:id/carbon — calculate carbon footprint of the trip
  app.get('/:id/carbon', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows } = await query(
      'SELECT user_id, transport, data, destination, country FROM itineraries WHERE id = $1',
      [request.params.id],
    )
    if (rows.length === 0) return reply.status(404).send({ message: 'Roteiro não encontrado.' })
    const it = rows[0]
    if (it.user_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })

    // Emission factors (kg CO2 per passenger-km)
    const FACTORS = {
      plane:  0.255,
      train:  0.041,
      car:    0.171,
      bus:    0.089,
      ferry:  0.119,
      bike:   0,
      walk:   0,
    }

    // Country centroid lookup for estimating flight distance from Portugal (origin default)
    const CENTROIDS = {
      default: [38.7, -9.1], // Lisbon
      'France': [46.2, 2.2], 'Spain': [40.4, -3.7], 'Italy': [41.9, 12.5],
      'Germany': [51.2, 10.5], 'Japan': [36.2, 138.3], 'USA': [37.1, -95.7],
      'Thailand': [15.9, 100.9], 'Brazil': [-14.2, -51.9], 'Australia': [-25.3, 133.8],
      'United Kingdom': [55.4, -3.4], 'Greece': [39.1, 21.8], 'Morocco': [31.8, -7.1],
      'Turkey': [38.9, 35.2], 'Mexico': [23.6, -102.6], 'India': [20.6, 78.9],
      'Indonesia': [-0.8, 113.9], 'Vietnam': [14.1, 108.3], 'Portugal': [39.4, -8.2],
    }

    function haversineKm(lat1, lon1, lat2, lon2) {
      const R = 6371
      const dLat = (lat2 - lat1) * Math.PI / 180
      const dLon = (lon2 - lon1) * Math.PI / 180
      const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }

    const transports = Array.isArray(it.transport) ? it.transport : (it.transport ? JSON.parse(it.transport) : ['plane'])
    const country    = it.country ?? ''
    const destCoords = CENTROIDS[country] ?? CENTROIDS.default
    const originCoords = CENTROIDS.default
    const tripDistKm = haversineKm(...originCoords, ...destCoords)

    const breakdown = []
    let totalKgCO2  = 0

    // Main trip transport (origin → destination → origin round-trip implied)
    for (const mode of transports) {
      const factor = FACTORS[mode] ?? 0
      if (factor === 0) continue
      const km = tripDistKm * 2 // round trip
      const kg = Math.round(km * factor)
      breakdown.push({ mode, distanceKm: Math.round(km), kgCO2: kg, label: 'Viagem principal' })
      totalKgCO2 += kg
    }

    // Local daily transport from activity-to-activity within days (estimate 10 km/day on average)
    const days = it.data?.days ?? []
    const localDays = days.length || 1
    const localMode = transports.find((m) => !['plane'].includes(m)) ?? 'bus'
    const localKm   = localDays * 10
    const localKg   = Math.round(localKm * (FACTORS[localMode] ?? FACTORS.bus))
    if (localKg > 0) {
      breakdown.push({ mode: localMode, distanceKm: localKm, kgCO2: localKg, label: 'Transporte local' })
      totalKgCO2 += localKg
    }

    // Equivalent trees needed to offset (1 tree absorbs ~21 kg CO2/year)
    const treesEquivalent = Math.ceil(totalKgCO2 / 21)
    // Equivalent car km
    const carKmEquivalent = Math.round(totalKgCO2 / FACTORS.car)

    return reply.send({
      totalKgCO2,
      breakdown,
      treesEquivalent,
      carKmEquivalent,
      offsetTip: 'Podes compensar a tua pegada em atmosfair.de ou goldstandard.org',
    })
  })

  // GET /itineraries/:id/companion — weather forecast + disruption alerts
  app.get('/:id/companion', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows } = await query(
      'SELECT destination, start_date, end_date, user_id FROM itineraries WHERE id = $1',
      [request.params.id],
    )
    if (rows.length === 0) return reply.status(404).send({ message: 'Roteiro não encontrado.' })

    const { destination, start_date, end_date } = rows[0]
    if (!start_date || !end_date) return reply.send({ weather: [] })

    try {
      // Geocode destination via Open-Meteo (no API key required)
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destination)}&count=1&language=en&format=json`,
      )
      const geoData = await geoRes.json()
      const loc = geoData.results?.[0]
      if (!loc) return reply.send({ weather: [] })

      // Fetch daily weather forecast
      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
        `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum` +
        `&timezone=auto&start_date=${start_date}&end_date=${end_date}`,
      )
      const weatherData = await weatherRes.json()
      const daily = weatherData.daily

      if (!daily?.time) return reply.send({ weather: [] })

      const weather = daily.time.map((date, i) => ({
        date,
        code:     daily.weathercode[i],
        tempMax:  Math.round(daily.temperature_2m_max[i]),
        tempMin:  Math.round(daily.temperature_2m_min[i]),
        precip:   Math.round((daily.precipitation_sum[i] ?? 0) * 10) / 10,
        isAlert:  daily.weathercode[i] >= 61 || daily.precipitation_sum[i] > 5,
      }))

      return reply.send({ weather })
    } catch {
      return reply.send({ weather: [] })
    }
  })

  // POST /itineraries/:id/companion/adapt — AI adapts a day for weather disruption
  app.post('/:id/companion/adapt', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({
      dayIndex:    z.number().int().min(0),
      weatherCode: z.number().int(),
      tempMax:     z.number(),
      tempMin:     z.number(),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const { rows } = await query(
      "SELECT data, destination, data->>'currency' AS currency, user_id FROM itineraries WHERE id = $1",
      [request.params.id],
    )
    if (rows.length === 0) return reply.status(404).send({ message: 'Roteiro não encontrado.' })
    if (rows[0].user_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })

    const day = rows[0].data?.days?.[parsed.data.dayIndex]
    if (!day) return reply.status(400).send({ message: 'Dia inválido.' })

    const result = await agentAdaptDayForWeather({
      destination: rows[0].destination,
      currency:    rows[0].currency ?? rows[0].data?.currency ?? 'EUR',
      day,
      weatherCode: parsed.data.weatherCode,
      tempMax:     parsed.data.tempMax,
      tempMin:     parsed.data.tempMin,
    })

    return reply.send({ activities: result.activities })
  })

  // POST /itineraries/:id/refine — conversational itinerary refinement
  app.post('/:id/refine', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({
      userMessage:         z.string().min(1).max(800),
      conversationHistory: z.array(z.object({
        role:    z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      })).max(20).default([]),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const { rows } = await query(
      "SELECT data, destination, data->>'currency' AS currency, user_id FROM itineraries WHERE id = $1",
      [request.params.id],
    )
    if (rows.length === 0) return reply.status(404).send({ message: 'Roteiro não encontrado.' })
    if (rows[0].user_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })

    const result = await agentRefineDays({
      destination:         rows[0].destination,
      currency:            rows[0].currency ?? rows[0].data?.currency ?? 'EUR',
      currentDays:         rows[0].data?.days ?? [],
      userMessage:         parsed.data.userMessage,
      conversationHistory: parsed.data.conversationHistory,
    })

    // Persist the updated days into the itinerary
    await query(
      `UPDATE itineraries SET data = jsonb_set(data, '{days}', $1::jsonb) WHERE id = $2`,
      [JSON.stringify(result.days), request.params.id],
    )

    return reply.send({ days: result.days })
  })

  // PATCH /itineraries/:id/activity — Replace one activity in JSONB
  app.patch('/:id/activity', { preHandler: [app.authenticate] }, async (request, reply) => {
    const activitySchema = z.object({
      time:        z.string(),
      name:        z.string().min(1).max(200),
      description: z.string().max(500),
      address:     z.string().nullable().optional(),
      geoName:     z.string().nullable().optional(),
      cost:        z.number().nullable().optional(),
      currency:    z.string().default('EUR'),
      type:        z.enum(['visit', 'food', 'transport', 'leisure', 'hotel']),
      tips:        z.string().nullable().optional(),
    })
    const schema = z.object({
      dayIndex:      z.number().int().min(0),
      activityIndex: z.number().int().min(0),
      activity:      activitySchema,
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.errors[0].message })
    }

    const { dayIndex, activityIndex, activity } = parsed.data

    const { rows } = await query(
      'SELECT data, user_id FROM itineraries WHERE id = $1',
      [request.params.id],
    )
    if (rows.length === 0) return reply.status(404).send({ message: 'Roteiro não encontrado.' })
    if (rows[0].user_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })

    const data = rows[0].data
    if (!data?.days?.[dayIndex]?.activities?.[activityIndex]) {
      return reply.status(400).send({ message: 'Índice inválido.' })
    }

    data.days[dayIndex].activities[activityIndex] = activity

    await query('UPDATE itineraries SET data = $1 WHERE id = $2', [JSON.stringify(data), request.params.id])

    difundirNaSala(`itinerary:${request.params.id}`, 'itinerary_changed', { dayIndex, activityIndex, activity }, request)

    return reply.send({ ok: true })
  })

  // POST /itineraries/:id/activity — add a new activity to a day (sorted by time)
  app.post('/:id/activity', { preHandler: [app.authenticate] }, async (request, reply) => {
    const activitySchema = z.object({
      time:        z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida (HH:MM)'),
      name:        z.string().min(1).max(200),
      description: z.string().max(500),
      address:     z.string().max(300).nullable().optional(),
      geoName:     z.string().nullable().optional(),
      cost:        z.number().nullable().optional(),
      currency:    z.string().default('EUR'),
      type:        z.enum(['visit', 'food', 'transport', 'leisure', 'hotel']),
      tips:        z.string().max(300).nullable().optional(),
    })
    const schema = z.object({
      dayIndex: z.number().int().min(0),
      activity: activitySchema,
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const { dayIndex, activity } = parsed.data

    const { rows } = await query('SELECT data, user_id FROM itineraries WHERE id = $1', [request.params.id])
    if (rows.length === 0) return reply.status(404).send({ message: 'Roteiro não encontrado.' })
    if (rows[0].user_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })

    const data = rows[0].data
    if (!Array.isArray(data?.days) || !data.days[dayIndex]) {
      return reply.status(400).send({ message: 'Dia inválido.' })
    }

    // Defesa em profundidade contra dados que a IA gerou antes de haver
    // validação. `activities` podia não existir ou não ser um array, e tanto o
    // push como o sort rebentavam com 500 — confirmado com um roteiro cujo dia
    // não tinha activities e outro em que era uma string.
    const dia = data.days[dayIndex]
    if (!Array.isArray(dia.activities)) dia.activities = []

    dia.activities.push(activity)

    // Uma actividade sem hora ordena-se primeiro em vez de rebentar. O caso
    // passava por acaso, consoante a ordem em que o comparador fosse chamado.
    dia.activities.sort((a, b) => String(a?.time ?? '').localeCompare(String(b?.time ?? '')))

    await query('UPDATE itineraries SET data = $1 WHERE id = $2', [JSON.stringify(data), request.params.id])

    difundirNaSala(`itinerary:${request.params.id}`, 'itinerary_changed', { dayIndex, activities: data.days[dayIndex].activities }, request)

    return reply.status(201).send({ activities: data.days[dayIndex].activities })
  })

  // DELETE /itineraries/:id/activity?dayIndex=&activityIndex= — remove an activity
  app.delete('/:id/activity', { preHandler: [app.authenticate] }, async (request, reply) => {
    const dayIndex      = parseInt(request.query.dayIndex,      10)
    const activityIndex = parseInt(request.query.activityIndex, 10)
    if (isNaN(dayIndex) || isNaN(activityIndex)) {
      return reply.status(400).send({ message: 'dayIndex e activityIndex são obrigatórios.' })
    }

    const { rows } = await query('SELECT data, user_id FROM itineraries WHERE id = $1', [request.params.id])
    if (rows.length === 0) return reply.status(404).send({ message: 'Roteiro não encontrado.' })
    if (rows[0].user_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })

    const data = rows[0].data
    if (!data?.days?.[dayIndex]?.activities?.[activityIndex]) {
      return reply.status(400).send({ message: 'Índice inválido.' })
    }

    if (!Array.isArray(data.days[dayIndex].activities)) {
      return reply.status(400).send({ message: 'Dia sem actividades.' })
    }
    data.days[dayIndex].activities.splice(activityIndex, 1)

    await query('UPDATE itineraries SET data = $1 WHERE id = $2', [JSON.stringify(data), request.params.id])

    difundirNaSala(`itinerary:${request.params.id}`, 'itinerary_changed', { dayIndex, activities: data.days[dayIndex].activities }, request)

    return reply.send({ ok: true })
  })

  // PATCH /itineraries/:id/reorder — reorder activities within a day
  app.patch('/:id/reorder', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({
      dayIndex:    z.number().int().min(0),
      activities:  z.array(z.unknown()).min(0),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.errors[0].message })
    }

    const { dayIndex, activities } = parsed.data

    const { rows } = await query('SELECT data, user_id FROM itineraries WHERE id = $1', [request.params.id])
    if (rows.length === 0) return reply.status(404).send({ message: 'Roteiro não encontrado.' })
    if (rows[0].user_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })

    const data = rows[0].data
    if (!Array.isArray(data?.days) || !data.days[dayIndex]) {
      return reply.status(400).send({ message: 'Dia inválido.' })
    }

    data.days[dayIndex].activities = activities

    await query('UPDATE itineraries SET data = $1 WHERE id = $2', [JSON.stringify(data), request.params.id])

    difundirNaSala(`itinerary:${request.params.id}`, 'itinerary_changed', { dayIndex, activities }, request)

    return reply.send({ ok: true })
  })

  // POST /itineraries/:id/checkin — mark activity as visited
  app.post('/:id/checkin', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({
      dayIndex:      z.number().int().min(0),
      activityIndex: z.number().int().min(0),
      activityName:  z.string().max(200).optional(),
      destination:   z.string().max(100).optional(),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const { dayIndex, activityIndex, activityName, destination } = parsed.data

    await query(
      `INSERT INTO activity_checkins (user_id, itinerary_id, day_index, activity_index, activity_name, destination)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, itinerary_id, day_index, activity_index) DO NOTHING`,
      [request.user.id, request.params.id, dayIndex, activityIndex, activityName ?? null, destination ?? null],
    )

    query('UPDATE users SET score = score + 2 WHERE id = $1', [request.user.id]).catch(() => {})

    return reply.status(201).send({ ok: true })
  })

  // DELETE /itineraries/:id/checkin?dayIndex=&activityIndex= — remove check-in
  app.delete('/:id/checkin', { preHandler: [app.authenticate] }, async (request, reply) => {
    const dayIndex      = parseInt(request.query.dayIndex,      10)
    const activityIndex = parseInt(request.query.activityIndex, 10)
    if (isNaN(dayIndex) || isNaN(activityIndex)) {
      return reply.status(400).send({ message: 'dayIndex e activityIndex são obrigatórios.' })
    }

    await query(
      `DELETE FROM activity_checkins
       WHERE user_id = $1 AND itinerary_id = $2 AND day_index = $3 AND activity_index = $4`,
      [request.user.id, request.params.id, dayIndex, activityIndex],
    )
    return reply.send({ ok: true })
  })

  // GET /itineraries/:id/checkins — get viewer's checkins for an itinerary
  app.get('/:id/checkins', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows } = await query(
      `SELECT day_index, activity_index, activity_name, destination, checked_in_at
       FROM activity_checkins
       WHERE user_id = $1 AND itinerary_id = $2
       ORDER BY checked_in_at ASC`,
      [request.user.id, request.params.id],
    )
    return reply.send({
      checkins: rows.map((r) => ({
        dayIndex:      r.day_index,
        activityIndex: r.activity_index,
        activityName:  r.activity_name,
        destination:   r.destination,
        checkedInAt:   r.checked_in_at,
      })),
    })
  })

  // PATCH /itineraries/:id — update metadata (title, dates, visibility, cover, budget…)
  app.patch('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const updateMetaSchema = z.object({
      title:       z.string().min(1).max(200).optional(),
      destination: z.string().max(100).optional(),
      start_date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      end_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      is_public:   z.boolean().optional(),
      cover_url:   z.string().url().max(500).optional().nullable(),
      budget:      z.number().positive().optional().nullable(),
      currency:    z.string().min(1).max(5).optional(),
    })

    const parsed = updateMetaSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.errors[0].message })
    }

    const { rows: own } = await query(
      'SELECT user_id FROM itineraries WHERE id = $1',
      [request.params.id],
    )
    if (own.length === 0) return reply.status(404).send({ message: 'Roteiro não encontrado.' })
    if (own[0].user_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })

    const FIELD_MAP = {
      title: 'title', destination: 'destination',
      start_date: 'start_date', end_date: 'end_date',
      is_public: 'is_public', cover_url: 'cover_url',
      budget: 'budget', currency: 'currency',
    }

    const updates = []
    const values  = []
    let idx = 1

    for (const [key, col] of Object.entries(FIELD_MAP)) {
      if (key in parsed.data) {
        updates.push(`${col} = $${idx++}`)
        values.push(parsed.data[key] ?? null)
      }
    }

    if (updates.length === 0) return reply.status(400).send({ message: 'Nenhum campo para actualizar.' })

    values.push(request.params.id)
    await query(
      `UPDATE itineraries SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx}`,
      values,
    )

    return reply.send({ ok: true })
  })

  // GET /itineraries/:id/collaborators — list collaborators
  app.get('/:id/collaborators', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows: own } = await query('SELECT user_id FROM itineraries WHERE id = $1', [request.params.id])
    if (own.length === 0) return reply.status(404).send({ message: 'Roteiro não encontrado.' })
    if (own[0].user_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })

    const { rows } = await query(
      `SELECT ic.user_id, ic.role, ic.accepted_at, ic.created_at,
              u.username, u.display_name, u.avatar_url
       FROM itinerary_collaborators ic
       JOIN users u ON u.id = ic.user_id
       WHERE ic.itinerary_id = $1
       ORDER BY ic.created_at ASC`,
      [request.params.id],
    )
    return reply.send({
      collaborators: rows.map((r) => ({
        userId:      r.user_id,
        username:    r.username,
        displayName: r.display_name ?? r.username,
        avatarUrl:   r.avatar_url,
        role:        r.role,
        accepted:    r.accepted_at !== null,
        invitedAt:   r.created_at,
      })),
    })
  })

  // POST /itineraries/:id/collaborators — invite user
  app.post('/:id/collaborators', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({
      userId: z.string().uuid(),
      role:   z.enum(['viewer', 'editor']).default('viewer'),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const { rows: own } = await query('SELECT user_id FROM itineraries WHERE id = $1', [request.params.id])
    if (own.length === 0) return reply.status(404).send({ message: 'Roteiro não encontrado.' })
    if (own[0].user_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })
    if (parsed.data.userId === request.user.id) return reply.status(400).send({ message: 'Não podes convidar-te a ti próprio.' })

    const { rows: target } = await query('SELECT id, username FROM users WHERE id = $1', [parsed.data.userId])
    if (target.length === 0) return reply.status(404).send({ message: 'Utilizador não encontrado.' })

    await query(
      `INSERT INTO itinerary_collaborators (itinerary_id, user_id, role, invited_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (itinerary_id, user_id) DO UPDATE SET role = $3`,
      [request.params.id, parsed.data.userId, parsed.data.role, request.user.id],
    )

    // Notify invited user
    await query(
      `INSERT INTO notifications (recipient_id, actor_id, type, message, target_url)
       VALUES ($1, $2, 'collab_invite', $3, $4)`,
      [
        parsed.data.userId,
        request.user.id,
        `${request.user.username} convidou-te para colaborar num roteiro.`,
        `/itineraries/${request.params.id}`,
      ],
    )
    if (global._io) global._io.to(`user:${parsed.data.userId}`).emit('new_notification', { type: 'collab_invite' })

    return reply.status(201).send({ ok: true, username: target[0].username })
  })

  // DELETE /itineraries/:id/collaborators/:userId — remove collaborator
  app.delete('/:id/collaborators/:userId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows: own } = await query('SELECT user_id FROM itineraries WHERE id = $1', [request.params.id])
    if (own.length === 0) return reply.status(404).send({ message: 'Roteiro não encontrado.' })
    const isOwner = own[0].user_id === request.user.id
    const isSelf  = request.params.userId === request.user.id
    if (!isOwner && !isSelf) return reply.status(403).send({ message: 'Sem permissão.' })

    await query(
      'DELETE FROM itinerary_collaborators WHERE itinerary_id = $1 AND user_id = $2',
      [request.params.id, request.params.userId],
    )
    return reply.send({ ok: true })
  })

  // POST /itineraries/:id/fork — clone a public itinerary to the current user
  app.post('/:id/fork', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows } = await query(
      'SELECT * FROM itineraries WHERE id = $1 AND is_public = TRUE',
      [request.params.id],
    )
    if (rows.length === 0) return reply.status(404).send({ message: 'Roteiro não encontrado ou não é público.' })

    const src = rows[0]

    const { rows: inserted } = await query(
      `INSERT INTO itineraries
        (user_id, title, destination, start_date, end_date, data, ai_generated,
         group_type, travel_style, budget, currency, country, continent,
         is_public, forked_from)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, FALSE, $14)
       RETURNING id`,
      [
        request.user.id,
        `Cópia de ${src.title}`,
        src.destination,
        src.start_date,
        src.end_date,
        src.data,
        src.ai_generated,
        src.group_type,
        src.travel_style,
        src.budget,
        src.currency,
        src.country,
        src.continent,
        src.id,
      ],
    )

    // Increment forks_count on the source (fire-and-forget)
    query('UPDATE itineraries SET forks_count = forks_count + 1 WHERE id = $1', [src.id]).catch(() => {})

    return reply.status(201).send({ id: inserted[0].id })
  })

  // DELETE /itineraries/:id
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows } = await query('SELECT user_id FROM itineraries WHERE id = $1', [request.params.id])
    if (rows.length === 0) return reply.status(404).send({ message: 'Roteiro não encontrado.' })
    if (rows[0].user_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })

    await query('DELETE FROM itineraries WHERE id = $1', [request.params.id])
    return reply.send({ ok: true })
  })

  // ── Itinerary comments ──────────────────────────────────────────────────────

  // GET /itineraries/:id/comments
}
