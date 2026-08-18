import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyCookie from '@fastify/cookie'
import fastifyJwt from '@fastify/jwt'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifyMultipart from '@fastify/multipart'
import fastifyHelmet from '@fastify/helmet'
import fastifyCompress from '@fastify/compress'
import fastifyUnderPressure from '@fastify/under-pressure'
import { Server as SocketIO } from 'socket.io'
import Redis               from 'ioredis'
import { createAdapter }   from '@socket.io/redis-adapter'

import { query }               from './db/pool.js'
import { authRoutes }          from './routes/auth.js'
import { usersRoutes }         from './routes/users.js'
import { postsRoutes }         from './routes/posts.js'
import { feedRoutes }          from './routes/feed.js'
import { itinerariesRoutes }   from './routes/itineraries.js'
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
import { setupSocket }         from './services/socket.js'
import { configureWebPush }    from './services/webPush.js'
import { startJobQueue, registerWorkers } from './services/jobQueue.js'

const PORT           = Number(process.env.PORT ?? 4000)
const SECRET         = process.env.JWT_SECRET
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET
const FRONTEND_URL   = process.env.FRONTEND_URL ?? 'http://localhost:3000'

if (!SECRET || !REFRESH_SECRET) {
  console.error('[server] JWT_SECRET and JWT_REFRESH_SECRET must be set in .env')
  process.exit(1)
}

const app = Fastify({
  logger: process.env.NODE_ENV !== 'production',
  // Trust the proxy only when explicitly configured — prevents X-Forwarded-For spoofing
  trustProxy: process.env.TRUSTED_PROXY ?? false,
})

// ─── Plugins ─────────────────────────────────────────────────────────────────

// Derive allowed origins for CSP (same as CORS — support comma-separated list)
const ALLOWED_ORIGINS = (process.env.FRONTEND_URL ?? 'http://localhost:3000')
  .split(',').map((o) => o.trim())

// Convert http(s):// origins to ws(s):// for CSP connect-src
const WS_ORIGINS = ALLOWED_ORIGINS.map((o) => o.replace(/^http/, 'ws'))

await app.register(fastifyHelmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'"],
      styleSrc:       ["'self'", "'unsafe-inline'"],
      imgSrc:         ["'self'", 'data:', 'blob:', '*.amazonaws.com', '*.cloudfront.net', '*.supabase.co'],
      fontSrc:        ["'self'", 'data:'],
      // Allow SSE + Socket.IO WebSocket connections back to the API itself
      connectSrc:     ["'self'", ...ALLOWED_ORIGINS, ...WS_ORIGINS],
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
  origin:      ALLOWED_ORIGINS,
  credentials: true,
})

await app.register(fastifyCookie, {
  secret: SECRET,
})

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

await app.register(fastifyRateLimit, {
  global:     true,
  max:        200,
  timeWindow: '1 minute',
  ...(redisClient ? { redis: redisClient } : {}),
})

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

// ─── Auth decorator ──────────────────────────────────────────────────────────

app.decorate('authenticate', async function (request, reply) {
  try {
    await request.jwtVerify()
  } catch {
    reply.status(401).send({ message: 'Não autorizado.' })
  }
})

// ─── last_seen — update every 5 min per authenticated user ──────────────────
// Uses request.user if already set by authenticate, otherwise tries a silent verify.

const lastSeenCache = new Map()
app.addHook('onRequest', async (request) => {
  try {
    const userId = request.user?.id ?? (await request.jwtVerify().then(() => request.user?.id).catch(() => null))
    if (!userId) return
    const now = Date.now()
    const prev = lastSeenCache.get(userId) ?? 0
    if (now - prev > 5 * 60 * 1000) {
      lastSeenCache.set(userId, now)
      query('UPDATE users SET last_seen = NOW() WHERE id = $1', [userId]).catch(() => {})
    }
  } catch {
    // unauthenticated request — ignore
  }
})

// ─── Routes ──────────────────────────────────────────────────────────────────

await app.register(authRoutes,          { prefix: '/auth' })
await app.register(usersRoutes,         { prefix: '/users' })
await app.register(postsRoutes,         { prefix: '/posts' })
await app.register(feedRoutes,          { prefix: '/feed' })
await app.register(itinerariesRoutes,   { prefix: '/itineraries' })
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

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

// ─── Start ────────────────────────────────────────────────────────────────────

await app.listen({ port: PORT, host: '0.0.0.0' })

const io = new SocketIO(app.server, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true },
  transports: ['websocket', 'polling'],
})

// Attach Redis adapter when running multiple API instances
if (redisClient && redisSub) {
  io.adapter(createAdapter(redisClient, redisSub))
  console.info('[socket.io] Redis adapter attached')
}

global._io = io
setupSocket(io, SECRET)
configureWebPush()

// ─── pg-boss job queue (requires DATABASE_URL env var) ───────────────────────
if (process.env.DATABASE_URL) {
  startJobQueue(process.env.DATABASE_URL)
    .then((boss) => registerWorkers(boss, { io }))
    .catch((err) => console.warn('[pg-boss] Failed to start:', err.message))
} else {
  console.warn('[pg-boss] DATABASE_URL not set — job queue disabled. Async AI generation unavailable.')
}

console.log(`[server] Memovoy API → http://localhost:${PORT}`)
