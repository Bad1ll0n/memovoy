import jwt from 'jsonwebtoken'

/**
 * Broadcasts to a room, skipping the client that caused the change.
 *
 * The originator already applied the change locally and gets the HTTP response,
 * so echoing the event back only costs it a redundant refetch — and can clobber
 * a local edit that has not been confirmed yet. The client sends its socket id
 * in `x-socket-id`; when absent (server-side call, or socket not yet connected)
 * this degrades to a plain room broadcast.
 *
 * @param {string} sala
 * @param {string} evento
 * @param {unknown} dados
 * @param {import('fastify').FastifyRequest} [request]
 */
export function difundirNaSala(sala, evento, dados, request) {
  const io = global._io
  if (!io) return

  const origem = request?.headers?.['x-socket-id']
  const alvo = typeof origem === 'string' && origem
    ? io.to(sala).except(origem)
    : io.to(sala)

  alvo.emit(evento, dados)
}

/**
 * @param {import('socket.io').Server} io
 * @param {string} jwtSecret
 */
export function setupSocket(io, jwtSecret) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token
    if (!token) return next(new Error('Não autorizado'))

    try {
      const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] })

      // A temp token issued mid-2FA is signed with the same secret as a real
      // access token, so the signature check above accepts it. Without this
      // guard, knowing only the password is enough to open a socket and join
      // the victim's user room — the same bypass already closed in the
      // `authenticate` decorator, but over WebSocket instead of HTTP.
      if (payload.scope === '2fa-pending') return next(new Error('Não autorizado'))

      socket.userId = payload.id
      next()
    } catch {
      next(new Error('Token inválido'))
    }
  })

  io.on('connection', (socket) => {
    const userId = socket.userId
    socket.join(`user:${userId}`)

    // Rate limit: max 10 socket events per 10-second window per connection.
    //
    // The window is tracked by timestamp rather than by setInterval. The timer
    // version created one live interval per connection, cleared only on
    // 'disconnect'; a connection dropped without that event leaked it, and a
    // pending timer alone is enough to keep the process from exiting.
    const RL_MAX       = 10
    const RL_JANELA_MS = 10_000
    let janelaInicio   = Date.now()
    let msgCount       = 0

    function throttled(handler) {
      return (...args) => {
        const agora = Date.now()
        if (agora - janelaInicio >= RL_JANELA_MS) {
          janelaInicio = agora
          msgCount = 0
        }
        if (++msgCount > RL_MAX) return
        handler(...args)
      }
    }

    socket.on('join_conversation', throttled(async (convId) => {
      try {
        const { query } = await import('../db/pool.js')
        const { rows } = await query(
          'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
          [convId, userId],
        )
        if (rows.length === 0) return
        socket.join(`conv:${convId}`)
      } catch (err) {
        console.error('[socket] join_conversation error', err.message)
      }
    }))

    socket.on('leave_conversation', throttled((convId) => {
      socket.leave(`conv:${convId}`)
    }))

    socket.on('mark_read', throttled(async (convId) => {
      try {
        const { query } = await import('../db/pool.js')
        const { rows: membership } = await query(
          'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
          [convId, userId],
        )
        if (membership.length === 0) return
        await query(
          `UPDATE messages SET read_at = NOW()
           WHERE conversation_id = $1 AND sender_id <> $2 AND read_at IS NULL`,
          [convId, userId],
        )
      } catch (err) {
        console.error('[socket] mark_read error', err.message)
      }
    }))

    // Sala de Planeamento — join itinerary room (requires ownership or collaborator role)
    socket.on('join_itinerary', throttled(async (itineraryId) => {
      try {
        const { query } = await import('../db/pool.js')
        const { rows } = await query(
          `SELECT 1 FROM itineraries WHERE id = $1 AND user_id = $2
           UNION
           SELECT 1 FROM itinerary_collaborators WHERE itinerary_id = $1 AND user_id = $2`,
          [itineraryId, userId],
        )
        if (rows.length === 0) return
        socket.join(`itinerary:${itineraryId}`)
      } catch (err) {
        console.error('[socket] join_itinerary error', err.message)
      }
    }))

    socket.on('leave_itinerary', throttled((itineraryId) => {
      socket.leave(`itinerary:${itineraryId}`)
    }))

    socket.on('disconnect', () => {
      socket.leave(`user:${userId}`)
    })

    // Admin room last, and deliberately not awaited before the handlers above.
    //
    // This used to run first, inside an async connection handler. Socket.IO
    // does not buffer incoming events for handlers registered later, so every
    // connection had a silent window the length of a database round-trip in
    // which join_conversation / join_itinerary / mark_read were dropped with no
    // error anywhere. A client that emits join_* right after 'connect' — the
    // natural thing to do — could end up in no room at all and simply receive
    // nothing in real time.
    ;(async () => {
      try {
        const { query } = await import('../db/pool.js')
        const { rows } = await query(
          'SELECT 1 FROM users WHERE id = $1 AND is_admin = TRUE',
          [userId],
        )
        if (rows.length > 0 && socket.connected) socket.join('admin:alerts')
      } catch { /* ignore — non-admin user */ }
    })()
  })
}
