// src/search/search.routes.js
// Prefixo: /search

import { z }             from 'zod'
import { SearchService } from './search.service.js'
import { optionalAuth }  from '../middleware/auth.js'
import { ValidationError } from '../shared/errors/index.js'

const searchSchema = z.object({
  q:     z.string().min(2).max(100),
  type:  z.enum(['all', 'itineraries', 'users', 'posts']).default('all'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

const autocompleteSchema = z.object({
  q: z.string().min(2).max(50),
})

export default async function searchRoutes(fastify) {
  const svc = new SearchService(fastify.db)

  // -----------------------------------------------------------------------
  // GET /search?q=tokyo&type=itineraries
  // -----------------------------------------------------------------------
  fastify.get('/', {
    preHandler: [optionalAuth],
    // Rate limit mais apertado para pesquisa (pode ser cara com pg_trgm)
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request) => {
    const parsed = searchSchema.safeParse(request.query)
    if (!parsed.success) {
      throw new ValidationError('Parâmetros inválidos', parsed.error.flatten())
    }

    const { q, type, limit } = parsed.data

    // Cache de pesquisas frequentes no Redis (5 min, só para queries sem auth)
    const viewerId = request.user?.sub ?? null
    const cacheKey = `search:${type}:${q.toLowerCase()}:${limit}`

    if (!viewerId && fastify.cache) {
      const cached = await fastify.cache.get(cacheKey)
      if (cached) return { ...cached, fromCache: true }
    }

    const results = await svc.search(q, { limit, type })

    // Guardar em cache (sem dados de viewer — seria incorrecto para outros utilizadores)
    if (!viewerId && fastify.cache) {
      fastify.cache.set(cacheKey, results, 300).catch(() => {})
    }

    return results
  })

  // -----------------------------------------------------------------------
  // GET /search/autocomplete?q=tok
  // Optimizado para latência baixa — sem cache de pesquisa
  // -----------------------------------------------------------------------
  fastify.get('/autocomplete', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request) => {
    const parsed = autocompleteSchema.safeParse(request.query)
    if (!parsed.success) {
      throw new ValidationError('Parâmetros inválidos', parsed.error.flatten())
    }

    // Cache agressivo para autocomplete — muda raramente
    const key = `autocomplete:${parsed.data.q.toLowerCase()}`
    if (fastify.cache) {
      const cached = await fastify.cache.get(key)
      if (cached) return cached
    }

    const results = await svc.autocomplete(parsed.data.q)

    if (fastify.cache) {
      fastify.cache.set(key, results, 600).catch(() => {}) // 10 min
    }

    return results
  })
}
