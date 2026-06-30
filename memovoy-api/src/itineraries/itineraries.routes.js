// src/itineraries/itineraries.routes.js
// Prefixo: /itineraries

import { z } from 'zod'
import { ItinerariesService } from './itineraries.service.js'
import { authenticate, optionalAuth } from '../middleware/auth.js'
import { GamificationService } from '../gamification/gamification.service.js'
import { ValidationError } from '../shared/errors/index.js'

// Schemas
const createItinerarySchema = z.object({
  title: z.string().min(3).max(120),
  destinationName: z.string().min(2).max(120),
  destinationLat: z.number().min(-90).max(90).optional(),
  destinationLng: z.number().min(-180).max(180).optional(),
  countryCode: z.string().length(2),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  groupType: z.enum(['solo', 'couple', 'friends', 'family']),
  transportModes: z.array(z.string()).optional(),
  budgetPerDay: z.number().int().positive().optional(),
  travelStyles: z.array(z.string()).max(5).optional(),
  visibility: z.enum(['public', 'followers', 'private']).default('public'),
}).refine(d => d.endDate >= d.startDate, {
  message: 'endDate deve ser igual ou posterior a startDate',
})

const addDaySchema = z.object({
  dayNumber: z.number().int().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  theme: z.string().max(100).optional(),
  notes: z.string().optional(),
})

const addActivitySchema = z.object({
  position: z.number().int().min(1),
  name: z.string().min(1).max(200),
  category: z.enum(['attraction', 'restaurant', 'transport', 'hotel', 'activity', 'break']).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  address: z.string().optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  durationMinutes: z.number().int().positive().optional(),
  notes: z.string().optional(),
  bookingUrl: z.string().url().optional(),
  priceEstimate: z.number().int().min(0).optional(),
  externalId: z.string().optional(),
  externalSource: z.enum(['google_places', 'getyourguide', 'booking', 'airbnb']).optional(),
})

export default async function itinerariesRoutes(fastify) {
  const svc = new ItinerariesService(fastify.db)

  // -------------------------------------------------------
  // POST /itineraries — criar roteiro
  // -------------------------------------------------------
  fastify.post('/', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const parsed = createItinerarySchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const { sub: userId, role } = request.user
    const itinerary = await svc.create(userId, role, parsed.data)
    return reply.status(201).send({ itinerary })
  })

  // -------------------------------------------------------
  // GET /itineraries/mine — roteiros do utilizador autenticado
  // -------------------------------------------------------
  fastify.get('/mine', {
    preHandler: [authenticate],
  }, async (request) => {
    const { sub: userId, role } = request.user
    const { status, page, limit } = request.query

    const itineraries = await svc.listMine(userId, role, {
      status,
      page: parseInt(page ?? 1),
      limit: Math.min(parseInt(limit ?? 20), 50),
    })

    return { itineraries }
  })

  // -------------------------------------------------------
  // GET /itineraries/:id — detalhe de um roteiro
  // -------------------------------------------------------
  fastify.get('/:id', {
    preHandler: [optionalAuth],
  }, async (request) => {
    const { id } = request.params
    const viewerId = request.user?.sub ?? null
    const viewerRole = request.user?.role ?? null

    const itinerary = await svc.findById(id, viewerId, viewerRole)
    return { itinerary }
  })

  // -------------------------------------------------------
  // POST /itineraries/:id/days — adicionar dia
  // -------------------------------------------------------
  fastify.post('/:id/days', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const parsed = addDaySchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const { sub: userId, role } = request.user
    const day = await svc.addDay(request.params.id, userId, role, parsed.data)
    return reply.status(201).send({ day })
  })

  // -------------------------------------------------------
  // POST /itineraries/days/:dayId/activities — adicionar actividade
  // -------------------------------------------------------
  fastify.post('/days/:dayId/activities', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const parsed = addActivitySchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    const { sub: userId, role } = request.user
    const activity = await svc.addActivity(request.params.dayId, userId, role, parsed.data)
    return reply.status(201).send({ activity })
  })

  // -------------------------------------------------------
  // POST /itineraries/:id/publish — publicar roteiro
  // -------------------------------------------------------
  fastify.post('/:id/publish', {
    preHandler: [authenticate],
  }, async (request) => {
    const { sub: userId, role } = request.user
    const result = await svc.publish(request.params.id, userId, role)

    // Invalidar cache do feed de descoberta — novo conteúdo publicado
    // fire-and-forget: não bloquear a resposta se o Redis estiver lento
    if (fastify.cache) {
      fastify.cache.invalidate('feed:discovery:*').catch(() => {})
      fastify.cache.del(fastify.cache.keys.topCountries()).catch(() => {})
    }

    return { itinerary: result }
  })

  // -------------------------------------------------------
  // DELETE /itineraries/:id — eliminar roteiro (soft delete)
  // -------------------------------------------------------
  fastify.delete('/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { sub: userId, role } = request.user
    await svc.delete(request.params.id, userId, role)
    return reply.status(204).send()
  })

  // -------------------------------------------------------
  // POST /itineraries/:id/save — guardar roteiro de outro utilizador
  // DELETE /itineraries/:id/save — remover dos guardados
  // -------------------------------------------------------
  fastify.post('/:id/save', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { sub: userId, role } = request.user
    await fastify.db.withUser(userId, role, async (sql) => {
      await sql`
        INSERT INTO saves (user_id, itinerary_id)
        VALUES (${userId}, ${request.params.id})
        ON CONFLICT DO NOTHING
      `
    })
    // Avaliar desafios de save em background
    new GamificationService(fastify.db).evaluateOnSave(userId, role).catch(() => {})
    return reply.status(201).send({ ok: true })
  })

  fastify.delete('/:id/save', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { sub: userId, role } = request.user
    await fastify.db.withUser(userId, role, async (sql) => {
      await sql`
        DELETE FROM saves
        WHERE user_id = ${userId} AND itinerary_id = ${request.params.id}
      `
    })
    return reply.status(204).send()
  })
}
