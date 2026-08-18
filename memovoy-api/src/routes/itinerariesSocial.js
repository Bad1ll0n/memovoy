import { z } from 'zod'
import { query } from '../db/pool.js'

// Comentários, reacções e linhagem de roteiros. Separado de itineraries.js, que
// tinha 1483 linhas: este bloco só depende de query e zod, o que o torna a
// divisão mais segura de fazer.
//
// Registado sob o mesmo prefixo /itineraries em app.js — para quem consome a
// API nada muda.

export async function itinerariesSocialRoutes(app) {
  app.get('/:id/comments', async (request, reply) => {
    const { rows } = await query(
      `SELECT c.*, u.username, u.display_name, u.avatar_url
       FROM itinerary_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.itinerary_id = $1 AND c.parent_id IS NULL
       ORDER BY c.created_at DESC`,
      [request.params.id],
    )
    reply.send({
      comments: rows.map((r) => ({
        id:          r.id,
        userId:      r.user_id,
        username:    r.username,
        displayName: r.display_name ?? r.username,
        avatarUrl:   r.avatar_url,
        parentId:    r.parent_id,
        content:     r.content,
        createdAt:   r.created_at,
      })),
    })
  })

  // POST /itineraries/:id/comments
  app.post('/:id/comments', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({
      content:  z.string().min(1).max(2200),
      parentId: z.string().uuid().optional(),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const { content, parentId } = parsed.data

    // Verify itinerary exists and is accessible
    const { rows: itiRows } = await query(
      'SELECT user_id, is_public FROM itineraries WHERE id = $1',
      [request.params.id],
    )
    if (itiRows.length === 0) return reply.status(404).send({ message: 'Roteiro não encontrado.' })
    const iti = itiRows[0]
    if (!iti.is_public && iti.user_id !== request.user.id) {
      return reply.status(403).send({ message: 'Sem permissão.' })
    }

    const { rows } = await query(
      `INSERT INTO itinerary_comments (itinerary_id, user_id, content, parent_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [request.params.id, request.user.id, content, parentId ?? null],
    )
    const comment = rows[0]

    // Notify itinerary owner
    if (iti.user_id !== request.user.id) {
      await query(
        `INSERT INTO notifications (recipient_id, actor_id, type, message, target_url)
         VALUES ($1, $2, 'comment', $3, $4)`,
        [iti.user_id, request.user.id,
          `${request.user.username} comentou o teu roteiro.`,
          `/itineraries/${request.params.id}`],
      )
      if (global._io) {
        global._io.to(`user:${iti.user_id}`).emit('new_notification', { type: 'comment' })
      }
    }

    const { rows: userRows } = await query(
      'SELECT display_name, avatar_url FROM users WHERE id = $1',
      [request.user.id],
    )
    const u = userRows[0] ?? {}

    reply.status(201).send({
      id:          comment.id,
      userId:      comment.user_id,
      username:    request.user.username,
      displayName: u.display_name ?? request.user.username,
      avatarUrl:   u.avatar_url,
      parentId:    comment.parent_id,
      content:     comment.content,
      createdAt:   comment.created_at,
    })
  })

  // DELETE /itineraries/comments/:commentId
  app.delete('/comments/:commentId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows } = await query(
      'SELECT user_id FROM itinerary_comments WHERE id = $1',
      [request.params.commentId],
    )
    if (rows.length === 0) return reply.status(404).send({ message: 'Comentário não encontrado.' })
    if (rows[0].user_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })
    await query('DELETE FROM itinerary_comments WHERE id = $1', [request.params.commentId])
    reply.send({ ok: true })
  })

  // ── Itinerary Reactions ─────────────────────────────────────────────────────

  // GET /itineraries/:id/reactions
  app.get('/:id/reactions', async (request, reply) => {
    const viewerId = request.user?.id ?? null
    const { rows } = await query(
      `SELECT
         COUNT(*) FILTER (WHERE type = 'quero_ir') AS quero_ir_count,
         COUNT(*) FILTER (WHERE type = 'ja_fui')   AS ja_fui_count,
         MAX(type) FILTER (WHERE user_id = $2)      AS viewer_reaction
       FROM itinerary_reactions WHERE itinerary_id = $1`,
      [request.params.id, viewerId],
    )
    const r = rows[0] ?? {}
    reply.send({
      queroIr:        Number(r.quero_ir_count ?? 0),
      jaFui:          Number(r.ja_fui_count   ?? 0),
      viewerReaction: r.viewer_reaction ?? null,
    })
  })

  // POST /itineraries/:id/reactions — upsert reaction (quero_ir | ja_fui)
  app.post('/:id/reactions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({ type: z.enum(['quero_ir', 'ja_fui']) })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const { rows: itiRows } = await query('SELECT user_id FROM itineraries WHERE id = $1', [request.params.id])
    if (itiRows.length === 0) return reply.status(404).send({ message: 'Roteiro não encontrado.' })

    await query(
      `INSERT INTO itinerary_reactions (itinerary_id, user_id, type)
       VALUES ($1, $2, $3)
       ON CONFLICT (itinerary_id, user_id) DO UPDATE SET type = $3, created_at = NOW()`,
      [request.params.id, request.user.id, parsed.data.type],
    )

    // Notify owner if it's not their own itinerary
    if (itiRows[0].user_id !== request.user.id) {
      const msg = parsed.data.type === 'quero_ir'
        ? `${request.user.username} quer ir ao teu roteiro!`
        : `${request.user.username} já foi ao teu roteiro!`
      await query(
        `INSERT INTO notifications (recipient_id, actor_id, type, message, target_url)
         VALUES ($1, $2, 'reaction', $3, $4)
         ON CONFLICT DO NOTHING`,
        [itiRows[0].user_id, request.user.id, msg, `/itineraries/${request.params.id}`],
      )
      if (global._io) global._io.to(`user:${itiRows[0].user_id}`).emit('new_notification', { type: 'reaction' })
    }

    reply.status(201).send({ ok: true })
  })

  // DELETE /itineraries/:id/reactions — remove reaction
  app.delete('/:id/reactions', { preHandler: [app.authenticate] }, async (request, reply) => {
    await query(
      'DELETE FROM itinerary_reactions WHERE itinerary_id = $1 AND user_id = $2',
      [request.params.id, request.user.id],
    )
    reply.send({ ok: true })
  })

  // ── Fork lineage ────────────────────────────────────────────────────────────

  // GET /itineraries/:id/lineage — ancestors + descendants (2 levels deep)
  app.get('/:id/lineage', async (request, reply) => {
    const viewerId = request.user?.id ?? null

    // Find immediate parent
    const { rows: parentRows } = await query(
      `SELECT i.id, i.title, i.destination, i.cover_url,
              u.username, u.avatar_url
       FROM itineraries i
       JOIN users u ON u.id = i.user_id
       WHERE i.id = (SELECT forked_from FROM itineraries WHERE id = $1)
         AND (i.is_public = TRUE OR i.user_id = $2)`,
      [request.params.id, viewerId],
    )

    // Find direct forks (children)
    const { rows: childRows } = await query(
      `SELECT i.id, i.title, i.destination, i.cover_url,
              u.username, u.avatar_url
       FROM itineraries i
       JOIN users u ON u.id = i.user_id
       WHERE i.forked_from = $1
         AND (i.is_public = TRUE OR i.user_id = $2)
       ORDER BY i.created_at DESC LIMIT 10`,
      [request.params.id, viewerId],
    )

    const toNode = (r) => ({
      id:          r.id,
      title:       r.title,
      destination: r.destination,
      coverUrl:    r.cover_url,
      author:      { username: r.username, avatarUrl: r.avatar_url },
    })

    reply.send({
      parent:   parentRows[0] ? toNode(parentRows[0]) : null,
      children: childRows.map(toNode),
    })
  })
}
