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
import { contadoresDaIa }      from './services/aiAgent.js'
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
import { adminRoutes }          from './routes/admin.js'
import { reportsRoutes }       from './routes/reports.js'

/**
 * Strips username and password from a URL before it reaches the logs.
 *
 * REDIS_URL is redis://[user]:[password]@host:port — logging it verbatim put
 * the password on stdout, and from there into any log aggregator.
 *
 * @param {string | undefined} url
 * @returns {string} The URL without credentials, or '(unreadable)' if it does not parse.
 */
export function redactarCredenciais(url) {
  if (!url) return '(empty)'
  try {
    const u = new URL(url)
    if (u.username || u.password) {
      u.username = '***'
      u.password = ''
    }
    return u.toString()
  } catch {
    // Malformed URL: do not risk printing the original.
    return '(unreadable)'
  }
}

/**
 * Builds the Fastify application without making it listen.
 *
 * Split out of server.js so tests can use app.inject() without opening a
 * listening socket or starting the job queue.
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.rateLimit=true] Turn off in tests: registration is
 *   capped at 5 requests per minute, so the second user a test creates would
 *   already get a 429.
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
    console.info('[redis] Connected —', redactarCredenciais(process.env.REDIS_URL))
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

  // ─── UUID route params ─────────────────────────────────────────────────────

  // Route ids go straight into SQL against UUID columns. A malformed one made
  // Postgres throw "invalid input syntax for type uuid", surfacing as a 500 —
  // wrong status for what is a client mistake, and it used to leak the query
  // text with it.
  //
  // Only these names are checked. `jti` is VARCHAR(64) and `token` is an invite
  // code: neither is a UUID column, so validating them would reject valid input.
  const PARAMS_UUID = new Set(['id', 'itineraryId', 'userId', 'postId', 'commentId'])
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  // Same for pagination cursors, which are message/post ids. /posts/nearby is
  // the exception — its cursor is a distance, not an id — and declares so with
  // `config: { cursorNumerico: true }`. Centralising the rule means a new route
  // inherits it instead of having to remember.
  const PARAMS_QUERY_UUID = new Set(['cursor', 'before'])

  app.addHook('preValidation', async (request, reply) => {
    for (const [nome, valor] of Object.entries(request.params ?? {})) {
      if (!PARAMS_UUID.has(nome)) continue
      if (typeof valor === 'string' && !UUID_RE.test(valor)) {
        return reply.status(400).send({ message: 'Identificador inválido.' })
      }
    }

    if (request.routeOptions?.config?.cursorNumerico) return

    for (const [nome, valor] of Object.entries(request.query ?? {})) {
      if (!PARAMS_QUERY_UUID.has(nome)) continue
      if (typeof valor === 'string' && valor !== '' && !UUID_RE.test(valor)) {
        return reply.status(400).send({ message: 'Cursor de paginação inválido.' })
      }
    }
  })

  // ─── Error handler ─────────────────────────────────────────────────────────

  // Fastify's default handler echoes the raw error message to the client. For a
  // database failure that means shipping the connection host and port — an
  // ECONNREFUSED reply literally read "connect ECONNREFUSED 127.0.0.1:5432".
  //
  // 5xx is masked and logged server-side instead. Below 500 the message is
  // preserved: those are validation errors the frontend shows to the user.
  app.setErrorHandler((error, request, reply) => {
    const status = error.statusCode ?? 500

    if (status < 500) {
      return reply.status(status).send({
        statusCode: status,
        error:      error.name ?? 'Error',
        message:    error.message,
      })
    }

    // 503 passa tal e qual. Não é uma avaria: é o under-pressure a recusar
    // trabalho de propósito, com uma mensagem escrita para ser lida e um
    // Retry-After que diz a clientes e balanceadores quanto esperar. Colapsá-lo
    // em 500 deitava fora esse sinal e anunciava uma avaria que não existe —
    // encontrado no teste de carga, onde todos os 503 chegavam como 500.
    //
    // Continua a não haver fuga de detalhes internos: esta mensagem é do
    // plugin, não do erro.
    if (status === 503) {
      return reply
        .status(503)
        .header('retry-after', reply.getHeader('retry-after') ?? '50')
        .send({
          statusCode: 503,
          error:      'Service Unavailable',
          message:    error.message,
        })
    }

    console.error('[error]', request.method, request.url, '—', error.message)

    return reply.status(500).send({
      statusCode: 500,
      error:      'Internal Server Error',
      message:    'Erro interno do servidor. Tenta novamente.',
    })
  })

  // ─── Auth decorator ────────────────────────────────────────────────────────

  app.decorate('authenticate', async function (request, reply) {
    try {
      await request.jwtVerify()
    } catch {
      return reply.status(401).send({ message: 'Não autorizado.' })
    }

    // A token issued mid-2FA is not a session. /auth/login hands one out after
    // the password step with scope '2fa-pending', and it is signed with the
    // same secret — so jwtVerify accepts it. Without this check, anyone holding
    // the password could use that token as a bearer for five minutes and skip
    // the second factor entirely.
    //
    // It is only good for POST /auth/2fa/authenticate, which reads it from the
    // body and does not go through this decorator.
    if (request.user?.scope === '2fa-pending') {
      return reply.status(401).send({ message: 'Autenticação em dois passos incompleta.' })
    }
  })

  // ─── requireAdmin — authenticate, then check the admin flag ────────────────
  //
  // The flag is read from the database on every call, never from the token. A
  // token outlives a revoked admin flag, so trusting a claim inside it would
  // leave a demoted account with moderation powers until expiry.
  app.decorate('requireAdmin', async function (request, reply) {
    await app.authenticate(request, reply)
    if (reply.sent) return

    const { rows } = await query(
      'SELECT is_admin FROM users WHERE id = $1',
      [request.user.id],
    )

    // Deliberately a 404, not a 403: a 403 confirms the route exists and tells
    // whoever is probing that there is an admin area worth attacking.
    if (!rows[0]?.is_admin) {
      return reply.status(404).send({ message: 'Não encontrado.' })
    }
  })

  // ─── last_seen — update every 5 min per authenticated user ─────────────────
  // Uses request.user if already set by authenticate, otherwise tries a silent verify.

  const LAST_SEEN_INTERVALO_MS = 5 * 60 * 1000
  // Above this, purge already-expired entries. Unbounded, the Map grew one
  // entry per authenticated user and never shrank — a memory leak in a
  // long-running process. Entries older than the interval are useless anyway:
  // the next request rewrites them regardless.
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
        // Deliberately not awaited: this is bookkeeping and must not delay the
        // response. But the error is no longer swallowed — if this failed
        // permanently, nobody would notice.
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
  await app.register(adminRoutes,          { prefix: '/admin' })

  // ─── Health check ──────────────────────────────────────────────────────────

  app.get('/health', async () => ({
    status: 'ok',
    ts: new Date().toISOString(),
    // Running totals since process start. Token counts were logged per call and
    // then forgotten — readable one line at a time, useless for answering what
    // the AI cost today or how often it is falling back.
    ia: contadoresDaIa(),
  }))

  return { app, redisClient, redisSub, allowedOrigins }
}
