import { z } from 'zod'
import { query } from '../db/pool.js'

function isOnline(lastSeen) {
  return lastSeen ? Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000 : false
}

export async function conversationsRoutes(app) {
  // GET /conversations
  app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id

    const { rows } = await query(
      `SELECT
        c.id,
        other.id          AS other_id,
        other.username    AS other_username,
        other.avatar_url  AS other_avatar_url,
        other.last_seen   AS other_last_seen,
        m.content         AS last_message,
        m.created_at      AS last_message_at,
        (
          SELECT COUNT(*) FROM messages
          WHERE conversation_id = c.id
            AND sender_id <> $1
            AND read_at IS NULL
        ) AS unread_count
       FROM conversations c
       JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = $1
       JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id <> $1
       JOIN users other ON other.id = cp2.user_id
       LEFT JOIN LATERAL (
         SELECT content, created_at FROM messages
         WHERE conversation_id = c.id
         ORDER BY created_at DESC
         LIMIT 1
       ) m ON TRUE
       ORDER BY COALESCE(m.created_at, c.created_at) DESC`,
      [userId],
    )

    return reply.send(
      rows.map((r) => ({
        id: r.id,
        otherUser: {
          id:        r.other_id,
          username:  r.other_username,
          avatarUrl: r.other_avatar_url,
          isOnline:  isOnline(r.other_last_seen),
        },
        lastMessage:   r.last_message,
        lastMessageAt: r.last_message_at,
        unreadCount:   Number(r.unread_count),
      })),
    )
  })

  // GET /conversations/:id?before=<uuid>&limit=<n>
  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id
    const convId = request.params.id
    const before = request.query.before ?? null   // cursor: last message id seen
    const limit  = Math.min(Number(request.query.limit ?? 40), 100)

    // Verify participation
    const { rows: part } = await query(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
      [convId, userId],
    )
    if (part.length === 0) return reply.status(403).send({ message: 'Sem acesso a esta conversa.' })

    const { rows: otherRows } = await query(
      `SELECT u.id, u.username, u.avatar_url, u.last_seen
       FROM conversation_participants cp
       JOIN users u ON u.id = cp.user_id
       WHERE cp.conversation_id = $1 AND cp.user_id <> $2`,
      [convId, userId],
    )

    const { rows: messages } = await query(
      `SELECT id, sender_id, content, created_at, read_at
       FROM messages
       WHERE conversation_id = $1
         AND ($2::uuid IS NULL OR created_at < (SELECT created_at FROM messages WHERE id = $2))
       ORDER BY created_at DESC
       LIMIT $3`,
      [convId, before, limit + 1],
    )

    // Return in ASC order; hasMore indicates older messages exist
    const hasMore = messages.length > limit
    const page    = messages.slice(0, limit).reverse()

    const other = otherRows[0]

    return reply.send({
      id: convId,
      otherUser: {
        id:        other.id,
        username:  other.username,
        avatarUrl: other.avatar_url,
        isOnline:  isOnline(other.last_seen),
      },
      messages: page.map((m) => ({
        id:        m.id,
        senderId:  m.sender_id,
        content:   m.content,
        createdAt: m.created_at,
        readAt:    m.read_at,
      })),
      hasMore,
      oldestCursor: page.length > 0 ? page[0].id : null,
    })
  })

  // POST /conversations — create or get existing
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const bodySchema = z.object({ userId: z.string().uuid() })
    const parsed = bodySchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: 'userId inválido.' })

    const targetId = parsed.data.userId
    const myId = request.user.id

    if (targetId === myId) return reply.status(400).send({ message: 'Não podes conversar contigo próprio.' })

    // Check if conversation already exists
    const { rows: existing } = await query(
      `SELECT c.id FROM conversations c
       JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = $1
       JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = $2`,
      [myId, targetId],
    )

    if (existing.length > 0) return reply.send({ id: existing[0].id })

    // Create new
    const { rows } = await query('INSERT INTO conversations DEFAULT VALUES RETURNING id')
    const convId = rows[0].id

    await query(
      'INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)',
      [convId, myId, targetId],
    )

    return reply.status(201).send({ id: convId })
  })
}
