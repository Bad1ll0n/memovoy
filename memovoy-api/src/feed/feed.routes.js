// src/feed/feed.routes.js
// Prefixo: /feed

import { FeedService } from './feed.service.js'
import { authenticate, optionalAuth } from '../middleware/auth.js'

export default async function feedRoutes(fastify) {
  const svc = new FeedService(fastify.db, fastify.cache)

  // -------------------------------------------------------
  // GET /feed — feed personalizado (seguidores)
  // -------------------------------------------------------
  fastify.get('/', {
    preHandler: [authenticate],
  }, async (request) => {
    const { sub: userId, role } = request.user
    const { cursor, limit } = request.query

    const result = await svc.getPersonalizedFeed(userId, role, {
      cursor: cursor ?? null,
      limit: parseInt(limit ?? 20),
    })

    // Registar impressões em background (fire-and-forget)
    // Alimenta o modelo de ML de recomendações
    if (result.items.length > 0) {
      const { sql } = fastify.db
      const impressions = result.items.map(p => ({
        user_id: userId,
        post_id: p.id,
        interaction_type: 'impression',
      }))
      sql`
        INSERT INTO feed_interactions ${sql(impressions)}
      `.catch(() => {})
    }

    return result
  })

  // -------------------------------------------------------
  // GET /feed/discovery — feed de descoberta (explorar)
  // -------------------------------------------------------
  fastify.get('/discovery', {
    preHandler: [optionalAuth],
  }, async (request) => {
    const viewerId = request.user?.sub ?? null
    const { cursor, limit, country } = request.query

    return svc.getDiscoveryFeed(viewerId, {
      cursor: cursor ?? null,
      limit: parseInt(limit ?? 20),
      countryCode: country ?? null,
    })
  })

  // -------------------------------------------------------
  // GET /feed/users/:userId — feed do perfil de um utilizador
  // -------------------------------------------------------
  fastify.get('/users/:userId', {
    preHandler: [optionalAuth],
  }, async (request) => {
    const { userId } = request.params
    const viewerId = request.user?.sub ?? null
    const viewerRole = request.user?.role ?? null
    const { cursor, limit } = request.query

    return svc.getUserFeed(userId, viewerId, viewerRole, {
      cursor: cursor ?? null,
      limit: parseInt(limit ?? 20),
    })
  })

  // -------------------------------------------------------
  // GET /feed/top-countries — top países do mês
  // -------------------------------------------------------
  fastify.get('/top-countries', async () => {
    const countries = await svc.getTopCountries()
    return { countries }
  })
}
