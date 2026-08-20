import { z } from 'zod'
import { query } from '../db/pool.js'

const sendSchema = z.object({
  conversationId: z.string().uuid(),
  content:        z.string().min(1).max(2000),
})

export async function messagesRoutes(app) {
  // POST /messages
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = sendSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.errors[0].message })
    }

    const { conversationId, content } = parsed.data
    const senderId = request.user.id

    // Verify sender is participant
    const { rows: part } = await query(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, senderId],
    )
    if (part.length === 0) {
      return reply.status(403).send({ message: 'Sem acesso a esta conversa.' })
    }

    const { rows } = await query(
      `INSERT INTO messages (conversation_id, sender_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, sender_id, content, created_at, read_at`,
      [conversationId, senderId, content],
    )

    const msg = rows[0]
    const dto = {
      id:        msg.id,
      senderId:  msg.sender_id,
      content:   msg.content,
      createdAt: msg.created_at,
      readAt:    msg.read_at,
    }

    // Emit to conversation room via Socket.IO
    const io = global._io
    if (io) {
      io.to(`conv:${conversationId}`).emit('new_message', dto)

      // Tell the other participants their conversation list changed. They
      // refetch it, and the unread badge is recomputed from the per-conversation
      // counts already in that response.
      //
      // There used to be a second event here, `unread_messages`, carrying a
      // count from a dedicated query. Nothing ever listened to it, and it was a
      // trap: the query was scoped to THIS conversation, so a payload named
      // like a global total actually held the count for one thread. Wiring it
      // to the badge would have shown the wrong number. Removed along with its
      // query — one round-trip to the database saved per message sent.
      const { rows: outros } = await query(
        'SELECT user_id FROM conversation_participants WHERE conversation_id = $1 AND user_id <> $2',
        [conversationId, senderId],
      )

      for (const row of outros) {
        io.to(`user:${row.user_id}`).emit('conversations:updated')
      }
      // Also refresh sender's conversation list (lastMessage preview)
      io.to(`user:${senderId}`).emit('conversations:updated')
    }

    return reply.status(201).send(dto)
  })
}
