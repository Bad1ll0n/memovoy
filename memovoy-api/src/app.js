import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyCookie from '@fastify/cookie'
import fastifyJwt from '@fastify/jwt'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifyMultipart from '@fastify/multipart'
import fastifyHelmet from '@fastify/helmet'
import fastifyCompress from '@fastify/compress'
import fastifyUnderPressure from '@fastify/under-pressure'
import Redis from 'ioredis'

import { query }               from './db/pool.js'
import { authRoutes }          from './routes/auth.js'
import { usersRoutes }         from './routes/users.js'
import { postsRoutes }         from './routes/posts.js'
import { feedRoutes }          from './routes/feed.js'
import { itinerariesRoutes }   from './routes/itineraries.js'
import { itinerariesSocialRoutes } from './routes/itinerariesSocial.js'
import { conversationsRoutes } from './routes/conversations.js'
import { messagesRoutes }      from './routes/messages.js'
import { notificationsRoutes } from './routes/notifications.js'
import { searchRoutes }        from './routes/search.js'
import { exploreRoutes }       from './routes/explore.js'
import { rankingsRoutes }      from './routes/rankings.js'
import { mapRoutes }           from './routes/map.js'
import { bookmarksRoutes }     from './routes/bookmarks.js'
import { uploadsRoutes }       from './routes/uploads.js'
import { expensesRoutes }      from './routes/expenses.js'
import { packingRoutes }       from './routes/packing.js'
import { groupsRoutes }        from './routes/groups.js'
import { reportsRoutes }       from './routes/reports.js'

/**
 * Constrói a aplicação Fastify sem a pôr à escuta.
 *
 * Separado do server.js para os testes poderem usar app.inject() sem levantar
 * um servidor, abrir sockets ou arrancar a fila de jobs.
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.rateLimit=true] Desligar nos testes: o registo está
 *   limitado a 5 pedidos por minuto e o segundo utilizador criado num teste
 *   já apanharia 429.
 * @returns {Promise<{ app: import('fastify').FastifyInstance, redisClient: Redis|null, redisSub: Redis|null, allowedOrigins: string[] }>}
 */
export async function buildApp({ rateLimit = true } = {}) {
  const SECRET         = process.env.JWT_SECRET
  const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET

  if (!SECRET || !REFRESH_SECRET) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be set')
  }

  const isTest = process.env.NODE_ENV === 'test'

  const app = Fastify({
    logger: process.env.NODE_ENV !== 'production' && !isTest,
    // Trust the proxy only when explicitly configured — prevents X-Forwarded-For spoofing
    trustProxy: process.env.TRUSTED_PROXY ?? false,
  })

  // ─── Plugins ───────────────────────────────────────────────────────────────

  // Derive allowed origins for CSP (same as CORS — support comma-separated list)
  const allowedOrigins = (process.env.FRONTEND_URL ?? 'http://localhost:3000')
    .split(',').map((o) => o.trim())

  // Convert http(s):// origins to ws(s):// for CSP connect-src
  const wsOrigins = allowedOrigins.map((o) => o.replace(/^http/, 'ws'))

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc:     ["'self'"],
        scriptSrc:      ["'self'"],
        styleSrc:       ["'self'", "'unsafe-inline'"],
        imgSrc:         ["'self'", 'data:', 'blob:', '*.amazonaws.com', '*.cloudfront.net', '*.supabase.co'],
        fontSrc:        ["'self'", 'data:'],
        // Allow SSE + Socket.IO WebSocket connections back to the API itself
        connectSrc:     ["'self'", ...allowedOrigins, ...wsOrigins],
        frameSrc:       ["'none'"],
        objectSrc:      ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
  })

  await app.register(fastifyCors, {
    origin:      allowedOrigins,
    credentials: true,
  })

  await app.register(fastifyCookie, { secret: SECRET })

  await app.register(fastifyJwt, {
    secret: SECRET,
    sign:   { algorithm: 'HS256' },
    verify: { algorithms: ['HS256'] },
  })

  // ─── Redis (optional — enables multi-instance rate-limit + Socket.IO adapter) ─

  let redisClient = null
  let redisSub    = null

  if (process.env.REDIS_URL) {
    const redisOpts = { lazyConnect: true, enableReadyCheck: false, maxRetriesPerRequest: 0 }
    redisClient = new Redis(process.env.REDIS_URL, redisOpts)
    redisSub    = new Redis(process.env.REDIS_URL, redisOpts)

    redisClient.on('error', (err) => console.warn('[redis] pub error:', err.message))
    redisSub.on('error',    (err) => console.warn('[redis] sub error:', err.message))

    await redisClient.connect().catch((e) => console.warn('[redis] connect failed:', e.message))
    await redisSub.connect().catch((e) => console.warn('[redis] sub connect failed:', e.message))
    console.info('[redis] Connected —', process.env.REDIS_URL)
  }

  if (rateLimit) {
    await app.register(fastifyRateLimit, {
      global:     true,
      max:        200,
      timeWindow: '1 minute',
      ...(redisClient ? { redis: redisClient } : {}),
    })
  }

  await app.register(fastifyMultipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  })

  await app.register(fastifyCompress, {
    global:      true,
    encodings:   ['gzip', 'deflate'],
    threshold:   1024,
  })

  await app.register(fastifyUnderPressure, {
    maxEventLoopDelay:     1000,
    maxHeapUsedBytes:      900_000_000,
    maxRssBytes:           1_200_000_000,
    maxEventLoopUtilization: 0.98,
    message:               'Servidor temporariamente sobrecarregado. Tenta novamente.',
    retryAfter:            50,
    exposeStatusRoute:     '/status',
  })

  // ─── Auth decorator ────────────────────────────────────────────────────────

  app.decorate('authenticate', async function (request, reply) {
    try {
      await request.jwtVerify()
    } catch {
      reply.status(401).send({ message: 'Não autorizado.' })
    }
  })

  // ─── last_seen — update every 5 min per authenticated user ─────────────────
  // Uses request.user if already set by authenticate, otherwise tries a silent verify.

  const LAST_SEEN_INTERVALO_MS = 5 * 60 * 1000
  // Acima disto, purga as entradas já expiradas. Sem limite o Map crescia uma
  // entrada por utilizador autenticado e nunca encolhia — num processo de longa
  // duração é uma fuga de memória. Entradas mais velhas que o intervalo não
  // servem para nada: o pedido seguinte reescreve na mesma.
  const LAST_SEEN_MAX_ENTRADAS = 10_000

  const lastSeenCache = new Map()

  app.addHook('onRequest', async (request) => {
    try {
      const userId = request.user?.id ?? (await request.jwtVerify().then(() => request.user?.id).catch(() => null))
      if (!userId) return
      const now = Date.now()
      const prev = lastSeenCache.get(userId) ?? 0
      if (now - prev > LAST_SEEN_INTERVALO_MS) {
        if (lastSeenCache.size >= LAST_SEEN_MAX_ENTRADAS) {
          for (const [id, quando] of lastSeenCache) {
            if (now - quando > LAST_SEEN_INTERVALO_MS) lastSeenCache.delete(id)
          }
        }
        lastSeenCache.set(userId, now)
        // Deliberadamente sem await: é escrituração, não deve atrasar a
        // resposta. Mas o erro deixa de ser engolido em silêncio — se isto
        // falhar sempre, ninguém dava por nada.
        query('UPDATE users SET last_seen = NOW() WHERE id = $1', [userId])
          .catch((err) => console.warn('[last_seen] falhou:', err.message))
      }
    } catch {
      // unauthenticated request — ignore
    }
  })

  // ─── Routes ────────────────────────────────────────────────────────────────

  await app.register(authRoutes,          { prefix: '/auth' })
  await app.register(usersRoutes,         { prefix: '/users' })
  await app.register(postsRoutes,         { prefix: '/posts' })
  await app.register(feedRoutes,          { prefix: '/feed' })
  await app.register(itinerariesRoutes,   { prefix: '/itineraries' })
  await app.register(itinerariesSocialRoutes, { prefix: '/itineraries' })
  await app.register(conversationsRoutes, { prefix: '/conversations' })
  await app.register(messagesRoutes,      { prefix: '/messages' })
  await app.register(notificationsRoutes, { prefix: '/notifications' })
  await app.register(searchRoutes,        { prefix: '/search' })
  await app.register(exploreRoutes,       { prefix: '/explore' })
  await app.register(rankingsRoutes,      { prefix: '/rankings' })
  await app.register(mapRoutes,           { prefix: '/map' })
  await app.register(bookmarksRoutes,     { prefix: '/bookmarks' })
  await app.register(uploadsRoutes,       { prefix: '/uploads' })
  await app.register(expensesRoutes,      { prefix: '/expenses' })
  await app.register(packingRoutes,       { prefix: '/packing' })
  await app.register(groupsRoutes,        { prefix: '/groups' })
  await app.register(reportsRoutes,       { prefix: '/reports' })

  // ─── Health check ──────────────────────────────────────────────────────────

  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

  return { app, redisClient, redisSub, allowedOrigins }
}
