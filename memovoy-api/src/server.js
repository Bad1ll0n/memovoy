// src/server.js
// Entry point da API MemoVoy.
// Regista todos os plugins e rotas, depois arranca o servidor.

import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifyCors from '@fastify/cors'
import fastifyHelmet from '@fastify/helmet'
import fastifyJwt from '@fastify/jwt'
import fastifyRateLimit from '@fastify/rate-limit'

import { config } from './config/index.js'
import { errorHandler } from './shared/errors/index.js'
import databasePlugin from './plugins/database.js'
import redisPlugin    from './plugins/redis.js'
import authRoutes from './auth/auth.routes.js'
import usersRoutes from './users/users.routes.js'
import itinerariesRoutes from './itineraries/itineraries.routes.js'
import feedRoutes from './feed/feed.routes.js'
import postsRoutes from './posts/posts.routes.js'
import wizardRoutes         from './ai/wizard.routes.js'
import searchRoutes         from './search/search.routes.js'
import notificationsRoutes  from './notifications/notifications.routes.js'
import expensesRoutes        from './expenses/expenses.routes.js'
import packingRoutes           from './packing/packing.routes.js'
import gamificationRoutes     from './gamification/gamification.routes.js'

const fastify = Fastify({
  logger: {
    level: config.isDev ? 'debug' : 'info',
    ...(config.isDev && {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss' },
      },
    }),
  },
  // Gerar requestId único para tracing
  genReqId: () => crypto.randomUUID(),
})

// -------------------------------------------------------
// Plugins de segurança e infra
// -------------------------------------------------------

// Headers de segurança (CSP, HSTS, X-Frame-Options, etc.)
await fastify.register(fastifyHelmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
})

// CORS — só permitir origins configuradas
await fastify.register(fastifyCors, {
  origin: config.cors.origins,
  credentials: true, // necessário para cookies httpOnly
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
})

// Rate limiting global
await fastify.register(fastifyRateLimit, {
  max: config.rateLimit.global,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Demasiados pedidos. Tenta novamente em 1 minuto.',
    },
  }),
})

// Cookies (para refresh token httpOnly)
await fastify.register(fastifyCookie, {
  secret: config.jwt.refreshSecret, // assinar cookies
})

// JWT — suporta dois secrets (access + refresh)
await fastify.register(fastifyJwt, {
  secret: {
    private: config.jwt.accessSecret,
    public: config.jwt.accessSecret,
  },
  // O decode usa o secret do access token por defeito
  // Para refresh token, usar fastify.jwt.verify com { key: refreshSecret }
})

// -------------------------------------------------------
// Plugins de infra: Redis (cache) + PostgreSQL
// Redis é registado primeiro — disponível para todos os outros plugins
// -------------------------------------------------------
await fastify.register(redisPlugin)
await fastify.register(databasePlugin)

// Expor config no fastify para acesso nas rotas
fastify.decorate('config', config)

// -------------------------------------------------------
// Error handler global
// -------------------------------------------------------
fastify.setErrorHandler(errorHandler)

// Handler para rotas não encontradas
fastify.setNotFoundHandler((request, reply) => {
  reply.status(404).send({
    error: {
      code: 'NOT_FOUND',
      message: `Rota não encontrada: ${request.method} ${request.url}`,
    },
  })
})

// -------------------------------------------------------
// Health check (sem autenticação, sem rate limit)
// -------------------------------------------------------
fastify.get('/health', {
  config: { rateLimit: { skip: () => true } },
}, async () => {
  // Verificar ligação à BD
  try {
    await fastify.db.sql`SELECT 1`
    return {
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      db: 'connected',
    }
  } catch {
    return {
      status: 'degraded',
      db: 'disconnected',
    }
  }
})

// -------------------------------------------------------
// Registar rotas com prefixos
// -------------------------------------------------------
await fastify.register(authRoutes,        { prefix: '/auth' })
await fastify.register(usersRoutes,       { prefix: '/users' })
await fastify.register(itinerariesRoutes, { prefix: '/itineraries' })
await fastify.register(feedRoutes,        { prefix: '/feed' })
await fastify.register(postsRoutes,       { prefix: '/posts' })
await fastify.register(wizardRoutes,         { prefix: '/ai' })
await fastify.register(notificationsRoutes, { prefix: '/notifications' })
// Expense tracker e packing list são subrotas de /itineraries/:itineraryId
await fastify.register(async (app) => {
  app.register(expensesRoutes, { prefix: '/:itineraryId/expenses' })
  app.register(packingRoutes,  { prefix: '/:itineraryId/packing'  })
}, { prefix: '/itineraries' })
await fastify.register(gamificationRoutes,  { prefix: '/gamification' })
await fastify.register(searchRoutes,        { prefix: '/search' })

// -------------------------------------------------------
// Arrancar servidor
// -------------------------------------------------------
try {
  await fastify.listen({
    host: config.server.host,
    port: config.server.port,
  })
  fastify.log.info(`MemoVoy API a correr em http://localhost:${config.server.port}`)
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}

export default fastify
