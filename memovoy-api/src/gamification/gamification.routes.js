// src/gamification/gamification.routes.js
// Prefixo: /gamification

import { GamificationService } from './gamification.service.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { ValidationError } from '../shared/errors/index.js'
import { z } from 'zod'

export default async function gamificationRoutes(fastify) {
  const svc = new GamificationService(fastify.db)

  // -----------------------------------------------------------------------
  // GET /gamification/profile — perfil completo do utilizador autenticado
  // -----------------------------------------------------------------------
  fastify.get('/profile', {
    preHandler: [authenticate],
  }, async (request) => {
    const { sub: userId } = request.user
    return svc.getProfile(userId)
  })

  // -----------------------------------------------------------------------
  // GET /gamification/profile/:userId — perfil público de outro utilizador
  // -----------------------------------------------------------------------
  fastify.get('/profile/:userId', async (request) => {
    return svc.getProfile(request.params.userId)
  })

  // -----------------------------------------------------------------------
  // GET /gamification/challenges — desafios disponíveis com progresso
  // -----------------------------------------------------------------------
  fastify.get('/challenges', {
    preHandler: [authenticate],
  }, async (request) => {
    const { sub: userId } = request.user
    const challenges = await svc.listChallenges(userId)
    return { challenges }
  })

  // -----------------------------------------------------------------------
  // POST /gamification/challenges/:id/join — entrar num desafio
  // -----------------------------------------------------------------------
  fastify.post('/challenges/:id/join', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { sub: userId, role } = request.user
    const entry = await svc.joinChallenge(userId, role, request.params.id)
    return reply.status(201).send({ entry })
  })

  // -----------------------------------------------------------------------
  // GET /gamification/leaderboard — ranking mensal
  // -----------------------------------------------------------------------
  fastify.get('/leaderboard', async (request) => {
    const schema = z.object({
      type:    z.enum(['global_trips', 'low_carbon', 'challenge']).default('global_trips'),
      period:  z.string().regex(/^\d{4}-\d{2}$/).optional(), // YYYY-MM
      scopeId: z.string().uuid().optional(),
      limit:   z.coerce.number().int().min(1).max(50).default(20),
    })

    const parsed = schema.safeParse(request.query)
    if (!parsed.success) throw new ValidationError('Parâmetros inválidos', parsed.error.flatten())

    const { type, period, scopeId, limit } = parsed.data

    // Converter YYYY-MM para YYYY-MM-01
    const periodDate = period ? `${period}-01` : null

    return svc.getLeaderboard(type, { period: periodDate, scopeId, limit })
  })

  // -----------------------------------------------------------------------
  // POST /gamification/leaderboard/recalculate — recalcular rankings (admin)
  // Normalmente chamado por cron job — endpoint para forçar manualmente.
  // -----------------------------------------------------------------------
  fastify.post('/leaderboard/recalculate', {
    preHandler: [authenticate, requireRole('admin')],
  }, async () => {
    return svc.recalculateLeaderboard()
  })
}
