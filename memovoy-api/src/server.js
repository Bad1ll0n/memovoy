import { Server as SocketIO } from 'socket.io'
import { createAdapter }      from '@socket.io/redis-adapter'

import { buildApp }           from './app.js'
import { setupSocket }        from './services/socket.js'
import { configureWebPush }   from './services/webPush.js'

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

console.log(`[server] Memovoy API → http://localhost:${PORT}`)
