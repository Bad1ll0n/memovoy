import { z } from 'zod'
import { query } from '../db/pool.js'
import { limparCampos } from '../services/sanitize.js'
import { checkFirstPost, checkFirstLike } from '../services/badges.js'
import { agentSuggestCaption, agentStreamCaption, agentIdentifyDestinationFromPhoto } from '../services/aiAgent.js'
import { notifyUser } from '../services/notifyUser.js'

function postDto(row) {
  return {
    id:            row.id,
    userId:        row.user_id,
    username:      row.username,
    displayName:   row.display_name ?? row.username,
    avatarUrl:     row.avatar_url,
    isVerified:    row.is_verified ?? false,
    caption:       row.caption,
    images:        row.images ?? [],
    destination:   row.destination,
    region:        row.region,
    likesCount:    Number(row.likes_count ?? 0),
    commentsCount: Number(row.comments_count ?? 0),
    viewerLiked:   row.viewer_liked ?? false,
    viewerSaved:   row.viewer_saved ?? false,
    createdAt:     row.created_at,
    lat:           row.lat ?? null,
    lon:           row.lon ?? null,
    itineraryLinked: row.iti_id ? {
      id:          row.iti_id,
      title:       row.iti_title,
      destination: row.iti_destination,
      startDate:   row.iti_start_date,
      endDate:     row.iti_end_date,
      coverUrl:    row.iti_cover_url,
      daysCount:   Number(row.iti_days_count ?? 0),
    } : null,
  }
}

function commentDto(row) {
  return {
    id:           row.id,
    userId:       row.user_id,
    username:     row.username,
    displayName:  row.display_name ?? row.username,
    avatarUrl:    row.avatar_url,
    parentId:     row.parent_id,
    content:      row.content,
    likes:        Number(row.likes ?? 0),
    viewerLiked:  row.viewer_liked ?? false,
    createdAt:    row.created_at,
  }
}

const createPostSchema = z.object({
  caption:      z.string().max(2200).default(''),
  images:       z.array(z.string().url()).max(10).default([]),
  destination:  z.string().max(100).optional(),
  region:       z.string().max(50).optional(),
  lat:          z.number().min(-90).max(90).optional(),
  lon:          z.number().min(-180).max(180).optional(),
  itineraryId:  z.string().uuid().optional(),
  groupId:      z.string().uuid().optional(),
})

const createCommentSchema = z.object({
  content:  z.string().min(1).max(2200),
  parentId: z.string().uuid().optional(),
})

export async function postsRoutes(app) {
  // GET /posts/nearby?lat=&lon=&radius=&cursor=
  // O cursor aqui é uma distância, não um id — daí a excepção à validação
  // de UUID que o hook em app.js aplica aos cursores.
  app.get('/nearby', { config: { cursorNumerico: true } }, async (request, reply) => {
    const lat    = parseFloat(request.query.lat ?? '')
    const lon    = parseFloat(request.query.lon ?? '')
    const radius = Math.min(Math.max(parseFloat(request.query.radius ?? '50'), 1), 200) // km, 1–200
    const cursor = request.query.cursor ? parseFloat(request.query.cursor) : null
    const viewerId = request.user?.id ?? null

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return reply.status(400).send({ message: 'lat e lon são obrigatórios.' })
    }

    // Haversine distance in km using SQL
    const { rows } = await query(
      `SELECT p.*,
        u.username, u.display_name, u.avatar_url, u.is_verified,
        COUNT(DISTINCT pl.user_id) AS likes_count,
        COUNT(DISTINCT pc.id)      AS comments_count,
        EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $3) AS viewer_liked,
        EXISTS(SELECT 1 FROM bookmarks WHERE post_id = p.id AND user_id = $3)  AS viewer_saved,
        (6371 * acos(
          cos(radians($1)) * cos(radians(p.lat)) *
          cos(radians(p.lon) - radians($2)) +
          sin(radians($1)) * sin(radians(p.lat))
        )) AS distance_km
       FROM posts p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN post_likes pl    ON pl.post_id = p.id
       LEFT JOIN post_comments pc ON pc.post_id = p.id
       WHERE p.lat IS NOT NULL AND p.lon IS NOT NULL
         AND (6371 * acos(
           cos(radians($1)) * cos(radians(p.lat)) *
           cos(radians(p.lon) - radians($2)) +
           sin(radians($1)) * sin(radians(p.lat))
         )) <= $4
         AND ($5::float IS NULL OR (
           (6371 * acos(
             cos(radians($1)) * cos(radians(p.lat)) *
             cos(radians(p.lon) - radians($2)) +
             sin(radians($1)) * sin(radians(p.lat))
           )) > $5
         ))
       GROUP BY p.id, u.id
       ORDER BY distance_km ASC
       LIMIT 21`,
      [lat, lon, viewerId, radius, cursor],
    )

    const hasMore = rows.length > 20
    const posts   = rows.slice(0, 20)
    reply.send({
      posts:      posts.map((r) => ({ ...postDto(r), distanceKm: Math.round(r.distance_km * 10) / 10 })),
      nextCursor: hasMore ? String(posts[posts.length - 1].distance_km) : null,
    })
  })

  // GET /posts/:id
  app.get('/:id', async (request, reply) => {
    const viewerId = request.user?.id ?? null

    const { rows } = await query(
      `SELECT p.*,
        u.username, u.display_name, u.avatar_url, u.is_verified,
        COUNT(DISTINCT pl.user_id) AS likes_count,
        COUNT(DISTINCT pc.id)      AS comments_count,
        EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $2) AS viewer_liked,
        EXISTS(SELECT 1 FROM bookmarks WHERE post_id = p.id AND user_id = $2)  AS viewer_saved,
        i.id          AS iti_id,
        i.title       AS iti_title,
        i.destination AS iti_destination,
        i.start_date  AS iti_start_date,
        i.end_date    AS iti_end_date,
        i.cover_url   AS iti_cover_url,
        COALESCE(jsonb_array_length(i.data->'days'), 0) AS iti_days_count
       FROM posts p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN post_likes pl    ON pl.post_id = p.id
       LEFT JOIN post_comments pc ON pc.post_id = p.id
       LEFT JOIN itineraries i    ON i.id = p.itinerary_id
       WHERE p.id = $1
       GROUP BY p.id, u.id, i.id`,
      [request.params.id, viewerId],
    )

    if (rows.length === 0) return reply.status(404).send({ message: 'Post não encontrado.' })
    reply.send(postDto(rows[0]))
  })

  // POST /posts
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = createPostSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const { caption, images, destination, region, lat, lon, itineraryId, groupId } =
      limparCampos(parsed.data, ['caption', 'destination', 'region'])

    // Validate itinerary ownership if provided
    if (itineraryId) {
      const { rows: itiRows } = await query(
        'SELECT id FROM itineraries WHERE id = $1 AND user_id = $2',
        [itineraryId, request.user.id],
      )
      if (itiRows.length === 0) {
        return reply.status(403).send({ message: 'Roteiro não encontrado ou sem permissão.' })
      }
    }

    // Validate group membership if posting to a group
    if (groupId) {
      const { rows: groupRows } = await query(
        'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
        [groupId, request.user.id],
      )
      if (groupRows.length === 0) {
        return reply.status(403).send({ message: 'Não és membro deste grupo.' })
      }
    }

    const { rows } = await query(
      `INSERT INTO posts (user_id, caption, images, destination, region, lat, lon, itinerary_id, group_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [request.user.id, caption, JSON.stringify(images), destination ?? null, region ?? null, lat ?? null, lon ?? null, itineraryId ?? null, groupId ?? null],
    )

    // Fetch itinerary preview if linked
    let itiRow = null
    if (itineraryId) {
      const { rows: itiRows } = await query(
        `SELECT id, title, destination, start_date, end_date, cover_url,
                COALESCE(jsonb_array_length(data->'days'), 0) AS days_count
         FROM itineraries WHERE id = $1`,
        [itineraryId],
      )
      itiRow = itiRows[0] ?? null
    }

    // +3 score ao publicar post (fire-and-forget)
    query('UPDATE users SET score = score + 3 WHERE id = $1', [request.user.id]).catch(() => {})
    checkFirstPost(request.user.id).catch(() => {})

    // Auto-tag destination from first image if user didn't specify one
    if (!destination && images.length > 0) {
      const postId = rows[0].id
      agentIdentifyDestinationFromPhoto(images[0]).then(async (result) => {
        if (result?.destination && result.confidence !== 'low') {
          await query(
            'UPDATE posts SET destination = $1 WHERE id = $2 AND destination IS NULL',
            [result.destination, postId],
          ).catch(() => {})
        }
      }).catch(() => {})
    }

    reply.status(201).send(postDto({
      ...rows[0],
      likes_count: 0,
      comments_count: 0,
      iti_id:          itiRow?.id ?? null,
      iti_title:       itiRow?.title ?? null,
      iti_destination: itiRow?.destination ?? null,
      iti_start_date:  itiRow?.start_date ?? null,
      iti_end_date:    itiRow?.end_date ?? null,
      iti_cover_url:   itiRow?.cover_url ?? null,
      iti_days_count:  itiRow?.days_count ?? 0,
    }))
  })

  // PATCH /posts/:id — editar caption ou destination
  app.patch('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({
      caption:     z.string().max(2200).optional(),
      destination: z.string().max(100).optional().nullable(),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const { rows: check } = await query('SELECT user_id FROM posts WHERE id = $1', [request.params.id])
    if (check.length === 0) return reply.status(404).send({ message: 'Post não encontrado.' })
    if (check[0].user_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })

    const { caption, destination } = limparCampos(parsed.data, ['caption', 'destination'])
    const updates = []
    const values  = []
    let idx = 1

    if (caption !== undefined)     { updates.push(`caption = $${idx++}`);     values.push(caption) }
    if (destination !== undefined) { updates.push(`destination = $${idx++}`); values.push(destination) }

    if (updates.length === 0) return reply.status(400).send({ message: 'Nenhum campo para actualizar.' })

    values.push(request.params.id)
    const { rows } = await query(
      `UPDATE posts SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      values,
    )
    reply.send(postDto({ ...rows[0], likes_count: 0, comments_count: 0 }))
  })

  // DELETE /posts/:id
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows } = await query('SELECT user_id FROM posts WHERE id = $1', [request.params.id])
    if (rows.length === 0) return reply.status(404).send({ message: 'Post não encontrado.' })
    if (rows[0].user_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })

    await query('DELETE FROM posts WHERE id = $1', [request.params.id])
    reply.send({ ok: true })
  })

  // POST /posts/:id/like
  app.post('/:id/like', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params
    const userId = request.user.id

    await query(
      'INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, userId],
    )

    // Notify post author
    const { rows } = await query('SELECT user_id FROM posts WHERE id = $1', [id])
    const authorId = rows[0]?.user_id
    if (authorId && authorId !== userId) {
      await notifyUser({
        recipientId: authorId,
        actorId:     userId,
        type:        'like',
        message:     `${request.user.username} curtiu o teu post.`,
        targetUrl:   `/posts/${id}`,
      })
      // +1 score ao autor por receber like (fire-and-forget)
      query('UPDATE users SET score = score + 1 WHERE id = $1', [authorId]).catch(() => {})
      checkFirstLike(authorId).catch(() => {})
    }

    reply.status(201).send({ ok: true })
  })

  // DELETE /posts/:id/like
  app.delete('/:id/like', { preHandler: [app.authenticate] }, async (request, reply) => {
    await query('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [request.params.id, request.user.id])
    reply.send({ ok: true })
  })

  // GET /posts/:id/comments
  app.get('/:id/comments', async (request, reply) => {
    const viewerId = request.user?.id ?? null
    const { rows } = await query(
      `SELECT c.*, u.username, u.display_name, u.avatar_url,
        COUNT(DISTINCT cl.user_id) AS likes,
        EXISTS(SELECT 1 FROM comment_likes WHERE comment_id = c.id AND user_id = $2) AS viewer_liked
       FROM post_comments c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN comment_likes cl ON cl.comment_id = c.id
       WHERE c.post_id = $1
       GROUP BY c.id, u.id
       ORDER BY c.created_at DESC`,
      [request.params.id, viewerId],
    )
    reply.send({ comments: rows.map(commentDto) })
  })

  // POST /posts/:id/comments
  app.post('/:id/comments', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = createCommentSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const { content, parentId } = limparCampos(parsed.data, ['content'])

    const { rows } = await query(
      `INSERT INTO post_comments (post_id, user_id, content, parent_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [request.params.id, request.user.id, content, parentId ?? null],
    )

    const comment = rows[0]

    // Notify post author
    const { rows: postRows } = await query('SELECT user_id FROM posts WHERE id = $1', [request.params.id])
    const authorId = postRows[0]?.user_id
    if (authorId && authorId !== request.user.id) {
      await notifyUser({
        recipientId: authorId,
        actorId:     request.user.id,
        type:        'comment',
        message:     `${request.user.username} comentou o teu post.`,
        targetUrl:   `/posts/${request.params.id}`,
      })
    }

    // Notify reply author (se for reply, notificar o autor do comentário pai)
    if (parentId) {
      const { rows: parentRows } = await query('SELECT user_id FROM post_comments WHERE id = $1', [parentId])
      const replyTargetId = parentRows[0]?.user_id
      if (replyTargetId && replyTargetId !== request.user.id && replyTargetId !== authorId) {
        await notifyUser({
          recipientId: replyTargetId,
          actorId:     request.user.id,
          type:        'comment',
          message:     `${request.user.username} respondeu ao teu comentário.`,
          targetUrl:   `/posts/${request.params.id}`,
        })
      }
    }

    // Fetch display_name from DB (JWT payload só tem id e username)
    const { rows: userRows } = await query('SELECT display_name, avatar_url FROM users WHERE id = $1', [request.user.id])
    const u = userRows[0] ?? {}
    reply.status(201).send(commentDto({ ...comment, username: request.user.username, display_name: u.display_name, avatar_url: u.avatar_url }))
  })

  // POST /posts/suggest-caption — AI caption suggestion
  app.post('/suggest-caption', { preHandler: [app.authenticate], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    // Only accept image URLs from trusted storage domains (not arbitrary user-supplied URLs)
    const TRUSTED_IMG_PATTERN = /^https?:\/\/(?:[a-z0-9-]+\.)?(?:amazonaws\.com|cloudfront\.net|supabase\.co|storage\.googleapis\.com|blob\.vercel-storage\.com|r2\.dev)/i
    const schema = z.object({
      destination: z.string().min(1).max(100),
      images:      z.array(z.string().url().refine((u) => TRUSTED_IMG_PATTERN.test(u), 'URL de imagem não autorizado.')).max(10).default([]),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    try {
      const result = await agentSuggestCaption(parsed.data)
      reply.send({ caption: result.caption ?? '' })
    } catch {
      reply.status(500).send({ message: 'Erro ao gerar legenda. Tenta novamente.' })
    }
  })

  // POST /posts/suggest-caption/stream — SSE streaming caption
  app.post('/suggest-caption/stream', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const TRUSTED_IMG_PATTERN = /^https?:\/\/(?:[a-z0-9-]+\.)?(?:amazonaws\.com|cloudfront\.net|supabase\.co|storage\.googleapis\.com|blob\.vercel-storage\.com|r2\.dev)/i
    const schema = z.object({
      destination: z.string().min(1).max(100),
      images:      z.array(z.string().url().refine((u) => TRUSTED_IMG_PATTERN.test(u), 'URL de imagem não autorizado.')).max(10).default([]),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.setHeader('X-Accel-Buffering', 'no')

    try {
      for await (const delta of agentStreamCaption(parsed.data)) {
        // Strip any HTML that might slip through non-JSON mode
        const safe = delta.replace(/<[^>]*>/g, '').replace(/ /g, '')
        if (safe) reply.raw.write(`data: ${JSON.stringify({ t: safe })}\n\n`)
      }
      reply.raw.write('data: [DONE]\n\n')
    } catch {
      reply.raw.write('data: {"error":true}\n\n')
    } finally {
      reply.raw.end()
    }
  })

  // POST /posts/comments/:id/like
  app.post('/comments/:id/like', { preHandler: [app.authenticate] }, async (request, reply) => {
    await query(
      'INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [request.params.id, request.user.id],
    )
    const { rows } = await query('SELECT COUNT(*) AS n FROM comment_likes WHERE comment_id = $1', [request.params.id])
    reply.status(201).send({ ok: true, likes: Number(rows[0].n) })
  })

  // DELETE /posts/comments/:id/like
  app.delete('/comments/:id/like', { preHandler: [app.authenticate] }, async (request, reply) => {
    await query('DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2', [request.params.id, request.user.id])
    const { rows } = await query('SELECT COUNT(*) AS n FROM comment_likes WHERE comment_id = $1', [request.params.id])
    reply.send({ ok: true, likes: Number(rows[0].n) })
  })

  // DELETE /posts/comments/:id — apagar comentário próprio
  app.delete('/comments/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows } = await query('SELECT user_id FROM post_comments WHERE id = $1', [request.params.id])
    if (rows.length === 0) return reply.status(404).send({ message: 'Comentário não encontrado.' })
    if (rows[0].user_id !== request.user.id) return reply.status(403).send({ message: 'Sem permissão.' })
    await query('DELETE FROM post_comments WHERE id = $1', [request.params.id])
    reply.send({ ok: true })
  })
}
