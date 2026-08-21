import { Server as SocketIO } from 'socket.io'
import { createAdapter }      from '@socket.io/redis-adapter'

import { buildApp }           from './app.js'
import { setupSocket }        from './services/socket.js'
import { configureWebPush }   from './services/webPush.js'
import { aguardarSegundoPlano, pendentesEmSegundoPlano } from './lib/emSegundoPlano.js'
import { pool }               from './db/pool.js'
import { relatarConfiguracao } from './lib/verificarConfiguracao.js'

// Process entry point. All app construction lives in app.js so tests can build
// an instance without a listening server or a job queue.

const PORT   = Number(process.env.PORT ?? 4000)
const SECRET = process.env.JWT_SECRET

// Antes de tudo o resto: dizer já o que não vai funcionar com este .env, em vez
// de deixar cada funcionalidade descobri-lo sozinha na primeira utilização.
try {
  relatarConfiguracao()
} catch (err) {
  console.error('[server]', err.message)
  process.exit(1)
}

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


// ─── Encerramento gracioso ───────────────────────────────────────────────────
//
// Não havia nenhum: um SIGTERM matava o processo a meio do que estivesse a
// acontecer. Numa plataforma que reinicia contentores a cada deploy isso é
// todos os dias, e o que se perde são as escritas que correm depois da resposta
// — pontuações, contagens de vistas, emblemas. Nada crítico isoladamente, mas
// desaparece em silêncio e ninguém consegue explicar porquê.
//
// A ordem importa: primeiro parar de aceitar pedidos novos, só depois esperar
// pelo que ficou em voo. Ao contrário, o trabalho pendente cresce enquanto se
// espera por ele.
let aEncerrar = false

for (const sinal of ['SIGTERM', 'SIGINT']) {
  process.on(sinal, async () => {
    if (aEncerrar) return   // segundo Ctrl+C não deve atropelar o primeiro
    aEncerrar = true
    console.info(`[server] ${sinal} — a encerrar`)

    const limite = setTimeout(() => {
      console.warn('[server] o encerramento demorou de mais, a sair à força')
      process.exit(1)
    }, 10_000)
    limite.unref()

    try {
      await app.close()
      io.close()

      const pendentes = pendentesEmSegundoPlano()
      if (pendentes > 0) {
        console.info(`[server] a aguardar ${pendentes} tarefa(s) em segundo plano`)
        const acabou = await aguardarSegundoPlano()
        if (!acabou) console.warn('[server] ficou trabalho por terminar')
      }

      await Promise.allSettled([
        redisClient?.quit(),
        redisSub?.quit(),
        pool.end(),
      ])
      console.info('[server] encerrado')
      process.exit(0)
    } catch (err) {
      console.error('[server] falha ao encerrar:', err.message)
      process.exit(1)
    }
  })
}
