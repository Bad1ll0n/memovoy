import jwt from 'jsonwebtoken'

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
      socket.userId = payload.id
      next()
    } catch {
      next(new Error('Token inválido'))
    }
  })

  io.on('connection', async (socket) => {
    const userId = socket.userId
    socket.join(`user:${userId}`)

    // Join admin room if user has admin privileges
    try {
      const { query } = await import('../db/pool.js')
      const { rows: adminRows } = await query(
        'SELECT 1 FROM users WHERE id = $1 AND is_admin = TRUE',
        [userId],
      )
      if (adminRows.length > 0) socket.join('admin:alerts')
    } catch { /* ignore — non-admin user */ }

    // Rate limit: max 10 socket events per 10-second window per connection
    let msgCount = 0
    const RL_MAX    = 10
    const rlTimer   = setInterval(() => { msgCount = 0 }, 10_000)

    function throttled(handler) {
      return (...args) => {
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
      clearInterval(rlTimer)
      socket.leave(`user:${userId}`)
    })
  })
}
