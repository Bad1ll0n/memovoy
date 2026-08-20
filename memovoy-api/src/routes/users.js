import { z } from 'zod'
import { query } from '../db/pool.js'
import { autorVisivelPara } from '../db/visibilidade.js'
import { limparCampos } from '../services/sanitize.js'
import { checkFirstFollower } from '../services/badges.js'
import { logAudit } from '../services/audit.js'
import { notifyUser } from '../services/notifyUser.js'
import { agentTravelBuddyMatch } from '../services/aiAgent.js'

function userDto(row, viewerId) {
  // Private fields only when the row belongs to the viewer: this DTO also
  // serves other people's profiles, and including them always leaked emails.
  //
  // The frontend stores the PATCH /users/me result in authStore via setAuth().
  // Without these fields, editing a profile wiped emailVerified and brought the
  // verification banner back for users who had already verified.
  const proprio = viewerId != null && row.id === viewerId

  return {
    id:                row.id,
    username:          row.username,
    displayName:       row.display_name ?? row.username,
    bio:               row.bio,
    location:          row.location ?? null,
    website:           row.website ?? null,
    avatarUrl:         row.avatar_url,
    coverUrl:          row.cover_url,
    isVerified:        row.is_verified,
    isPrivate:         row.is_private,
    score:             Number(row.score ?? 0),
    postsCount:        Number(row.posts_count ?? 0),
    followersCount:    Number(row.followers_count ?? 0),
    followingCount:    Number(row.following_count ?? 0),
    countriesCount:    Number(row.countries_count ?? 0),
    itinerariesCount:  Number(row.itineraries_count ?? 0),
    viewerFollows:     row.viewer_follows ?? false,
    ...(proprio ? {
      email:               row.email,
      emailVerified:       row.email_verified ?? false,
      onboardingCompleted: row.onboarding_completed ?? false,
      // Only ever exposed to the account itself, and only to decide whether to
      // show the moderation link. Authorisation is never based on it: every
      // /admin route re-reads the flag from the database.
      isAdmin:             row.is_admin ?? false,
    } : {}),
  }
}

const updateSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  bio:         z.string().max(300).optional().nullable(),
  location:    z.string().max(100).optional().nullable(),
  website:     z.string().url().max(300).optional().nullable(),
  isPrivate:   z.boolean().optional(),
  avatarUrl:   z.string().url().optional().nullable(),
  coverUrl:    z.string().url().optional().nullable(),
})

export async function usersRoutes(app) {
  // GET /users/me — perfil do utilizador autenticado (registar antes de /:id)
  app.get('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows } = await query(
      `SELECT u.*,
        COUNT(DISTINCT f.follower_id)  AS followers_count,
        COUNT(DISTINCT f2.following_id) AS following_count,
        COUNT(DISTINCT p.id)           AS posts_count,
        COUNT(DISTINCT NULLIF(it.country, '')) AS countries_count,
        COUNT(DISTINCT it.id)          AS itineraries_count
       FROM users u
       LEFT JOIN follows f  ON f.following_id = u.id
       LEFT JOIN follows f2 ON f2.follower_id = u.id
       LEFT JOIN posts p    ON p.user_id = u.id
       LEFT JOIN itineraries it ON it.user_id = u.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [request.user.id],
    )
    if (rows.length === 0) return reply.status(404).send({ message: 'Utilizador não encontrado.' })
    return reply.send(userDto(rows[0], request.user.id))
  })

  // GET /users/buddies — travel buddy matching by compatible travel styles
  app.get('/buddies', { preHandler: [app.authenticate], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const viewerId = request.user.id

    // Get viewer's travel styles from their itineraries
    const { rows: myStyles } = await query(
      `SELECT DISTINCT jsonb_array_elements_text(travel_style) AS style
       FROM itineraries WHERE user_id = $1 AND travel_style IS NOT NULL LIMIT 10`,
      [viewerId],
    )
    const userStyles = myStyles.map((r) => r.style)

    if (userStyles.length === 0) {
      return reply.send({ matches: [] })
    }

    // Candidate pool: users not yet followed, with at least 1 itinerary
    const { rows: candidates } = await query(
      `SELECT u.id AS "userId", u.display_name AS "displayName", u.avatar_url AS "avatarUrl",
              u.username, u.score,
              array_agg(DISTINCT jsonb_array_elements_text(i.travel_style)) FILTER (WHERE i.travel_style IS NOT NULL) AS styles
       FROM users u
       JOIN itineraries i ON i.user_id = u.id
       WHERE u.id <> $1
         AND u.id NOT IN (SELECT following_id FROM follows WHERE follower_id = $1)
       GROUP BY u.id
       HAVING COUNT(i.id) >= 1
       ORDER BY u.score DESC
       LIMIT 30`,
      [viewerId],
    )

    if (candidates.length === 0) return reply.send({ matches: [] })

    try {
      const result = await agentTravelBuddyMatch({
        userStyles,
        candidates: candidates.map((c) => ({ userId: c.userId, styles: c.styles ?? [] })),
      })

      // Enrich matched userIds with DB profile data
      const profileMap = Object.fromEntries(candidates.map((c) => [c.userId, c]))
      const enriched = (result.matches ?? []).map((m) => ({
        ...m,
        username:    profileMap[m.userId]?.username,
        displayName: profileMap[m.userId]?.displayName,
        avatarUrl:   profileMap[m.userId]?.avatarUrl,
        score:       profileMap[m.userId]?.score,
      }))

      return reply.send({ matches: enriched })
    } catch {
      return reply.send({ matches: [] })
    }
  })

  // GET /users/suggested
  app.get('/suggested', { preHandler: [app.authenticate] }, async (request, reply) => {
    const limit = Math.min(Number(request.query.limit ?? 5), 20)
    const viewerId = request.user.id

    const { rows } = await query(
      `SELECT u.*,
        COUNT(DISTINCT f2.follower_id) AS followers_count,
        EXISTS(
          SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = u.id
        ) AS viewer_follows
       FROM users u
       LEFT JOIN follows f2 ON f2.following_id = u.id
       WHERE u.id <> $1
         AND u.id NOT IN (
           SELECT following_id FROM follows WHERE follower_id = $1
         )
       GROUP BY u.id
       ORDER BY followers_count DESC
       LIMIT $2`,
      [viewerId, limit],
    )

    return reply.send(rows.map((r) => userDto(r, viewerId)))
  })

  // GET /users/:id
  app.get('/:id', async (request, reply) => {
    const viewerId = request.user?.id ?? null
    const { id } = request.params

    const { rows } = await query(
      `SELECT u.*,
        COUNT(DISTINCT p.id)           AS posts_count,
        COUNT(DISTINCT fl.follower_id) AS followers_count,
        COUNT(DISTINCT flg.following_id) AS following_count,
        COUNT(DISTINCT NULLIF(it.country, '')) AS countries_count,
        COUNT(DISTINCT it2.id)         AS itineraries_count,
        EXISTS(
          SELECT 1 FROM follows WHERE follower_id = $2 AND following_id = u.id
        ) AS viewer_follows
       FROM users u
       LEFT JOIN posts p         ON p.user_id = u.id
       LEFT JOIN follows fl      ON fl.following_id = u.id
       LEFT JOIN follows flg     ON flg.follower_id = u.id
       LEFT JOIN itineraries it  ON it.user_id = u.id AND it.country IS NOT NULL
       LEFT JOIN itineraries it2 ON it2.user_id = u.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [id, viewerId],
    )

    if (rows.length === 0) return reply.status(404).send({ message: 'Utilizador não encontrado.' })
    return reply.send(userDto(rows[0], viewerId))
  })

  // PATCH /users/me
  app.patch('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = updateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.errors[0].message })
    }

    // Campos de texto livre: retirar markup antes de guardar. As URLs e o
    // booleano ficam intactos.
    const { displayName, bio, location, website, isPrivate, avatarUrl, coverUrl } =
      limparCampos(parsed.data, ['displayName', 'bio', 'location'])
    const updates = []
    const values = []
    let idx = 1

    if (displayName !== undefined) { updates.push(`display_name = $${idx++}`); values.push(displayName) }
    if (bio !== undefined)         { updates.push(`bio = $${idx++}`);          values.push(bio) }
    if (location !== undefined)    { updates.push(`location = $${idx++}`);     values.push(location) }
    if (website !== undefined)     { updates.push(`website = $${idx++}`);      values.push(website ?? null) }
    if (isPrivate !== undefined)   { updates.push(`is_private = $${idx++}`);   values.push(isPrivate) }
    if (avatarUrl !== undefined)   { updates.push(`avatar_url = $${idx++}`);   values.push(avatarUrl) }
    if (coverUrl !== undefined)    { updates.push(`cover_url = $${idx++}`);    values.push(coverUrl) }

    if (updates.length === 0) return reply.status(400).send({ message: 'Nenhum campo para actualizar.' })

    values.push(request.user.id)
    const { rows } = await query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      values,
    )

    return reply.send({ user: userDto(rows[0], request.user.id) })
  })

  // DELETE /users/me
  app.delete('/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    // Awaited on purpose: without it the DELETE below can win the race and the
    // audit INSERT fails on the foreign key, losing the record that the account
    // was deleted on request.
    await logAudit(request.user.id, 'account_delete', {}, request.headers['x-forwarded-for'] ?? null)
    await query('DELETE FROM users WHERE id = $1', [request.user.id])
    reply.clearCookie('refreshToken', { path: '/auth' })
    return reply.send({ ok: true })
  })

  // POST /users/:id/follow
  app.post('/:id/follow', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params
    const followerId = request.user.id

    if (id === followerId) return reply.status(400).send({ message: 'Não podes seguir-te a ti próprio.' })

    await query(
      'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [followerId, id],
    )

    await notifyUser({
      recipientId: id,
      actorId:     followerId,
      type:        'follow',
      message:     `${request.user.username} começou a seguir-te.`,
      targetUrl:   `/profile/${followerId}`,
    })

    checkFirstFollower(id).catch(() => {})

    return reply.status(201).send({ ok: true })
  })

  // DELETE /users/:id/follow
  app.delete('/:id/follow', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params
    await query('DELETE FROM follows WHERE follower_id = $1 AND following_id = $2', [request.user.id, id])
    return reply.send({ ok: true })
  })

  // GET /users/:id/followers
  app.get('/:id/followers', async (request, reply) => {
    const viewerId = request.user?.id ?? null
    const { rows } = await query(
      `SELECT u.*,
         EXISTS(
           SELECT 1 FROM follows WHERE follower_id = $2 AND following_id = u.id
         ) AS viewer_follows
       FROM users u
       JOIN follows f ON f.follower_id = u.id
       WHERE f.following_id = $1
       ORDER BY f.created_at DESC`,
      [request.params.id, viewerId],
    )
    return reply.send({ users: rows.map((r) => userDto(r, viewerId)) })
  })

  // GET /users/:id/following
  app.get('/:id/following', async (request, reply) => {
    const viewerId = request.user?.id ?? null
    const { rows } = await query(
      `SELECT u.*,
         EXISTS(
           SELECT 1 FROM follows WHERE follower_id = $2 AND following_id = u.id
         ) AS viewer_follows
       FROM users u
       JOIN follows f ON f.following_id = u.id
       WHERE f.follower_id = $1
       ORDER BY f.created_at DESC`,
      [request.params.id, viewerId],
    )
    return reply.send({ users: rows.map((r) => userDto(r, viewerId)) })
  })

  // GET /users/:id/posts
  app.get('/:id/posts', async (request, reply) => {
    const { id } = request.params
    const cursor = request.query.cursor
    const limit = 12
    const viewerId = request.user?.id ?? null

    const { rows: existe } = await query('SELECT 1 FROM users WHERE id = $1', [id])
    if (existe.length === 0) return reply.status(404).send({ message: 'Utilizador não encontrado.' })
    if (!(await autorVisivelPara(id, viewerId))) {
      return reply.status(403).send({ message: 'Conta privada.' })
    }

    const { rows } = await query(
      `SELECT p.*,
        u.username, u.display_name, u.avatar_url, u.is_verified,
        COUNT(DISTINCT pl.user_id) AS likes_count,
        COUNT(DISTINCT pc.id)      AS comments_count,
        EXISTS(
          SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $3
        ) AS viewer_liked,
        EXISTS(
          SELECT 1 FROM bookmarks WHERE post_id = p.id AND user_id = $3
        ) AS viewer_saved,
        i.id          AS iti_id,
        i.title       AS iti_title,
        i.destination AS iti_destination,
        i.start_date  AS iti_start_date,
        i.end_date    AS iti_end_date,
        i.cover_url   AS iti_cover_url,
        COALESCE(jsonb_array_length(i.data->'days'), 0) AS iti_days_count
       FROM posts p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN post_likes pl ON pl.post_id = p.id
       LEFT JOIN post_comments pc ON pc.post_id = p.id
       LEFT JOIN itineraries i  ON i.id = p.itinerary_id
       WHERE p.user_id = $1
         AND ($2::uuid IS NULL OR p.created_at < (SELECT created_at FROM posts WHERE id = $2))
       GROUP BY p.id, u.username, u.display_name, u.avatar_url, u.is_verified, i.id
       ORDER BY p.created_at DESC
       LIMIT $4`,
      [id, cursor ?? null, request.user?.id ?? null, limit + 1],
    )

    const hasMore = rows.length > limit
    const posts   = rows.slice(0, limit)

    return reply.send({
      posts: posts.map(postDto),
      nextCursor: hasMore ? posts[posts.length - 1].id : null,
    })
  })

  // GET /users/:id/saved — bookmarked posts + itineraries
  app.get('/:id/saved', async (request, reply) => {
    const { id } = request.params
    const viewerId = request.user?.id ?? null
    const cursor = request.query.cursor
    const limit = 12

    const { rows: existe } = await query('SELECT 1 FROM users WHERE id = $1', [id])
    if (existe.length === 0) return reply.status(404).send({ message: 'Utilizador não encontrado.' })
    if (!(await autorVisivelPara(id, viewerId))) {
      return reply.status(403).send({ message: 'Conta privada.' })
    }

    const { rows } = await query(
      `SELECT
         b.id AS bookmark_id, b.created_at AS bookmarked_at,
         p.id AS post_id, p.images AS post_images, p.caption AS post_caption,
         p.user_id AS post_user_id,
         i.id AS iti_id, i.title AS iti_title, i.destination AS iti_destination, i.cover_url AS iti_cover
       FROM bookmarks b
       LEFT JOIN posts p ON p.id = b.post_id
       LEFT JOIN itineraries i ON i.id = b.itinerary_id
       WHERE b.user_id = $1
         AND ($2::uuid IS NULL OR b.created_at < (SELECT created_at FROM bookmarks WHERE id = $2))
       ORDER BY b.created_at DESC
       LIMIT $3`,
      [id, cursor ?? null, limit + 1],
    )

    const hasMore = rows.length > limit
    const items = rows.slice(0, limit).map((r) => ({
      bookmarkId:  r.bookmark_id,
      bookmarkedAt: r.bookmarked_at,
      post: r.post_id ? {
        id:      r.post_id,
        images:  r.post_images ?? [],
        caption: r.post_caption,
        userId:  r.post_user_id,
      } : null,
      itinerary: r.iti_id ? {
        id:          r.iti_id,
        title:       r.iti_title,
        destination: r.iti_destination,
        coverUrl:    r.iti_cover,
      } : null,
    }))

    return reply.send({
      items,
      nextCursor: hasMore ? items[items.length - 1].bookmarkId : null,
    })
  })

  // GET /users/:id/liked — posts que o utilizador deu like (privado: só o próprio)
  app.get('/:id/liked', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params
    const viewerId = request.user.id

    if (viewerId !== id) return reply.status(403).send({ message: 'Só podes ver os teus próprios likes.' })

    const cursor = request.query.cursor
    const limit  = 12

    const { rows } = await query(
      `SELECT
         p.*,
         u.username        AS username,
         u.display_name    AS display_name,
         u.avatar_url      AS avatar_url,
         u.is_verified     AS is_verified,
         COUNT(DISTINCT pl2.user_id) AS likes_count,
         COUNT(DISTINCT pc.id)       AS comments_count,
         TRUE                        AS viewer_liked,
         EXISTS(
           SELECT 1 FROM bookmarks WHERE post_id = p.id AND user_id = $3
         ) AS viewer_saved,
         pl.created_at AS liked_at
       FROM post_likes pl
       JOIN posts p   ON p.id = pl.post_id
       JOIN users u   ON u.id = p.user_id
       LEFT JOIN post_likes pl2 ON pl2.post_id = p.id
       LEFT JOIN post_comments pc ON pc.post_id = p.id
       WHERE pl.user_id = $1
         AND ($2::uuid IS NULL OR pl.created_at < (
           SELECT created_at FROM post_likes WHERE post_id = $2 AND user_id = $1
         ))
       GROUP BY p.id, u.id, pl.created_at
       ORDER BY pl.created_at DESC
       LIMIT $4`,
      [id, cursor ?? null, viewerId, limit + 1],
    )

    const hasMore = rows.length > limit
    const posts   = rows.slice(0, limit)

    return reply.send({
      posts:      posts.map(postDto),
      nextCursor: hasMore ? posts[posts.length - 1].id : null,
    })
  })

  // GET /users/:id/itineraries
  app.get('/:id/itineraries', async (request, reply) => {
    const { id } = request.params
    const cursor = request.query.cursor
    const limit  = 10

    const { rows } = await query(
      `SELECT id, title, destination, start_date, end_date,
              ai_generated, saves_count, views_count, cover_url,
              jsonb_array_length(data->'days') AS days_count
       FROM itineraries
       WHERE user_id = $1 AND (is_public = TRUE OR user_id = $3)
         AND ($2::uuid IS NULL OR created_at < (SELECT created_at FROM itineraries WHERE id = $2))
       ORDER BY created_at DESC
       LIMIT $4`,
      [id, cursor ?? null, request.user?.id ?? null, limit + 1],
    )

    const hasMore = rows.length > limit
    const items   = rows.slice(0, limit)

    return reply.send({
      itineraries: items.map((r) => ({
        id:          r.id,
        title:       r.title,
        destination: r.destination,
        startDate:   r.start_date,
        endDate:     r.end_date,
        coverUrl:    r.cover_url,
        aiGenerated: r.ai_generated,
        savesCount:  Number(r.saves_count),
        viewsCount:  Number(r.views_count),
        daysCount:   Number(r.days_count ?? 0),
      })),
      nextCursor: hasMore ? items[items.length - 1].id : null,
    })
  })

  // ── Device sessions ─────────────────────────────────────────────────────────

  // GET /users/me/sessions — list active sessions for the authenticated user
  app.get('/me/sessions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows } = await query(
      `SELECT id, jti, device_name, ip_address, user_agent, created_at, last_seen_at, expires_at
       FROM device_sessions
       WHERE user_id = $1 AND expires_at > NOW()
       ORDER BY last_seen_at DESC`,
      [request.user.id],
    )
    return reply.send({
      sessions: rows.map((r) => ({
        id:         r.id,
        jti:        r.jti,
        deviceName: r.device_name,
        ipAddress:  r.ip_address,
        userAgent:  r.user_agent,
        createdAt:  r.created_at,
        lastSeenAt: r.last_seen_at,
        expiresAt:  r.expires_at,
      })),
    })
  })

  // DELETE /users/me/sessions/:jti — revoke a specific session
  app.delete('/me/sessions/:jti', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows } = await query(
      'SELECT id, expires_at FROM device_sessions WHERE jti = $1 AND user_id = $2',
      [request.params.jti, request.user.id],
    )
    if (rows.length === 0) return reply.status(404).send({ message: 'Sessão não encontrada.' })

    const expiresAt = rows[0].expires_at
    await Promise.all([
      query('DELETE FROM device_sessions WHERE jti = $1', [request.params.jti]),
      query(
        'INSERT INTO revoked_tokens (jti, expires_at) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [request.params.jti, expiresAt],
      ),
    ])
    return reply.send({ ok: true })
  })

  // ── GDPR export ─────────────────────────────────────────────────────────────

  // GET /users/me/export — download all user data as JSON
  app.get('/me/export', { preHandler: [app.authenticate], config: { rateLimit: { max: 3, timeWindow: '1 hour' } } }, async (request, reply) => {
    const uid = request.user.id

    const [profileRows, postsRows, itinerariesRows, followsRows, commentsRows, messagesRows] = await Promise.all([
      query('SELECT id, username, email, display_name, bio, location, website, avatar_url, created_at FROM users WHERE id = $1', [uid]),
      query('SELECT id, caption, images, destination, created_at FROM posts WHERE user_id = $1 ORDER BY created_at DESC', [uid]),
      query('SELECT id, title, destination, start_date, end_date, is_public, created_at FROM itineraries WHERE user_id = $1 ORDER BY created_at DESC', [uid]),
      query('SELECT following_id FROM follows WHERE follower_id = $1', [uid]),
      query('SELECT id, content, created_at FROM post_comments WHERE user_id = $1 ORDER BY created_at DESC', [uid]),
      query('SELECT id, content, created_at FROM messages WHERE sender_id = $1 ORDER BY created_at DESC LIMIT 500', [uid]),
    ])

    const profile     = profileRows.rows[0] ?? {}
    const exportData  = {
      exportedAt:  new Date().toISOString(),
      profile,
      posts:        postsRows.rows,
      itineraries:  itinerariesRows.rows,
      following:    followsRows.rows.map((r) => r.following_id),
      comments:     commentsRows.rows,
      messages:     messagesRows.rows,
    }

    return reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="memovoy-export-${uid}.json"`)
      .send(JSON.stringify(exportData, null, 2))
  })

  // GET /users/:id/checkins — public check-in history
  app.get('/:id/checkins', async (request, reply) => {
    const viewerId = request.user?.id ?? null
    const { rows: existe } = await query('SELECT 1 FROM users WHERE id = $1', [request.params.id])
    if (existe.length === 0) return reply.status(404).send({ message: 'Utilizador não encontrado.' })
    if (!(await autorVisivelPara(request.params.id, viewerId))) {
      return reply.status(403).send({ message: 'Conta privada.' })
    }

    const { id } = request.params
    const limit  = 20

    const { rows } = await query(
      `SELECT ac.itinerary_id, ac.activity_name, ac.destination, ac.day_index, ac.checked_in_at,
              i.title AS itinerary_title, i.cover_url
       FROM activity_checkins ac
       JOIN itineraries i ON i.id = ac.itinerary_id
       WHERE ac.user_id = $1
       ORDER BY ac.checked_in_at DESC
       LIMIT $2`,
      [id, limit],
    )

    return reply.send({
      checkins: rows.map((r) => ({
        itineraryId:    r.itinerary_id,
        itineraryTitle: r.itinerary_title,
        coverUrl:       r.cover_url,
        activityName:   r.activity_name,
        destination:    r.destination,
        dayIndex:       r.day_index,
        checkedInAt:    r.checked_in_at,
      })),
    })
  })

  // GET /users/:id/travel-stats — temporal travel statistics grouped by year
  app.get('/:id/travel-stats', async (request, reply) => {
    const viewerId = request.user?.id ?? null
    const { rows: existe } = await query('SELECT 1 FROM users WHERE id = $1', [request.params.id])
    if (existe.length === 0) return reply.status(404).send({ message: 'Utilizador não encontrado.' })
    if (!(await autorVisivelPara(request.params.id, viewerId))) {
      return reply.status(403).send({ message: 'Conta privada.' })
    }

    const { id } = request.params

    const [yearlyRows, totalRow, topDestRow] = await Promise.all([
      // Itineraries and unique countries per year (based on start_date)
      query(
        `SELECT EXTRACT(YEAR FROM start_date)::int AS year,
                COUNT(*)                           AS itineraries,
                COUNT(DISTINCT NULLIF(country, '')) AS countries
         FROM itineraries
         WHERE user_id = $1 AND start_date IS NOT NULL
           AND (is_public = TRUE OR user_id = $2)
         GROUP BY year
         ORDER BY year DESC
         LIMIT 10`,
        [id, request.user?.id ?? null],
      ),
      // All-time totals
      query(
        `SELECT COUNT(*)                           AS total_itineraries,
                COUNT(DISTINCT NULLIF(country, '')) AS total_countries
         FROM itineraries
         WHERE user_id = $1 AND (is_public = TRUE OR user_id = $2)`,
        [id, request.user?.id ?? null],
      ),
      // Top 3 most-visited destinations
      query(
        `SELECT destination, COUNT(*) AS visits
         FROM itineraries
         WHERE user_id = $1 AND destination IS NOT NULL AND destination <> ''
           AND (is_public = TRUE OR user_id = $2)
         GROUP BY destination
         ORDER BY visits DESC
         LIMIT 3`,
        [id, request.user?.id ?? null],
      ),
    ])

    return reply.send({
      byYear:          yearlyRows.rows.map((r) => ({
        year:         r.year,
        itineraries:  Number(r.itineraries),
        countries:    Number(r.countries),
      })),
      totalItineraries: Number(totalRow.rows[0]?.total_itineraries ?? 0),
      totalCountries:   Number(totalRow.rows[0]?.total_countries ?? 0),
      topDestinations:  topDestRow.rows.map((r) => ({
        destination: r.destination,
        visits:      Number(r.visits),
      })),
    })
  })
}

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
    likesCount:    Number(row.likes_count ?? 0),
    commentsCount: Number(row.comments_count ?? 0),
    viewerLiked:   row.viewer_liked ?? false,
    viewerSaved:   row.viewer_saved ?? false,
    createdAt:     row.created_at,
    isFollowing:   row.is_following ?? false,
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
