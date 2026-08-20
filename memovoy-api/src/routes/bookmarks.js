import { z } from 'zod'
import { query } from '../db/pool.js'
import { emSegundoPlano } from '../lib/emSegundoPlano.js'

const createSchema = z.union([
  z.object({ postId: z.string().uuid() }),
  z.object({ itineraryId: z.string().uuid() }),
])

export async function bookmarksRoutes(app) {
  // POST /bookmarks
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: 'postId ou itineraryId obrigatório.' })

    const data = parsed.data
    const userId = request.user.id

    if ('postId' in data) {
      await query(
        'INSERT INTO bookmarks (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userId, data.postId],
      )
    } else {
      await query(
        'INSERT INTO bookmarks (user_id, itinerary_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userId, data.itineraryId],
      )
      // Increment saves count + +5 score ao autor
      const { rows: itiRows } = await query(
        'UPDATE itineraries SET saves_count = saves_count + 1 WHERE id = $1 RETURNING user_id',
        [data.itineraryId],
      )
      const itiAuthorId = itiRows[0]?.user_id
      if (itiAuthorId && itiAuthorId !== userId) {
        emSegundoPlano(query('UPDATE users SET score = score + 5 WHERE id = $1', [itiAuthorId]))
      }
    }

    return reply.status(201).send({ ok: true })
  })

  // DELETE /bookmarks/post/:postId
  app.delete('/post/:postId', { preHandler: [app.authenticate] }, async (request, reply) => {
    await query(
      'DELETE FROM bookmarks WHERE user_id = $1 AND post_id = $2',
      [request.user.id, request.params.postId],
    )
    return reply.send({ ok: true })
  })

  // DELETE /bookmarks/itinerary/:itineraryId
  app.delete('/itinerary/:itineraryId', { preHandler: [app.authenticate] }, async (request, reply) => {
    await query(
      'DELETE FROM bookmarks WHERE user_id = $1 AND itinerary_id = $2',
      [request.user.id, request.params.itineraryId],
    )
    await query(
      'UPDATE itineraries SET saves_count = GREATEST(saves_count - 1, 0) WHERE id = $1',
      [request.params.itineraryId],
    )
    return reply.send({ ok: true })
  })
}
