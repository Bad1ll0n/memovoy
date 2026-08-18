import { Server as SocketIO } from 'socket.io'
import { createAdapter }      from '@socket.io/redis-adapter'

import { buildApp }           from './app.js'
import { setupSocket }        from './services/socket.js'
import { configureWebPush }   from './services/webPush.js'
import { startJobQueue, registerWorkers } from './services/jobQueue.js'

// Process entry point. All app construction lives in app.js so tests can build
// an instance without a listening server or a job queue.

const PORT   = Number(process.env.PORT ?? 4000)
const SECRET = process.env.JWT_SECRET

let built
try {
  built = await buildApp()
} catch (err) {
  console.error('[server]', err.message)
  process.exit(1)
}

const { app, redisClient, redisSub, allowedOrigins } = built

await app.listen({ port: PORT, host: '0.0.0.0' })

const io = new SocketIO(app.server, {
  cors: { origin: allowedOrigins, credentials: true },
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
