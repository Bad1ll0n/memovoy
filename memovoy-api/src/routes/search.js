import { z } from 'zod'
import { query } from '../db/pool.js'
import { agentSearchDestinations } from '../services/aiAgent.js'

export async function searchRoutes(app) {
  // POST /search/destinations — AI-powered natural language destination search
  app.post('/destinations', {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 15, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const schema = z.object({ query: z.string().min(3).max(300) })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    try {
      const result = await agentSearchDestinations(parsed.data.query)
      return reply.send(result)
    } catch {
      return reply.status(503).send({ message: 'Pesquisa com IA indisponível. Tenta novamente.' })
    }
  })

  // GET /search?q=&type=
  // Uses pg_trgm GIN indexes for similarity search — handles leading-wildcard
  // patterns efficiently (idx_users_username_trgm etc. from migration 021).
  app.get('/', async (request, reply) => {
    const t0 = Date.now()
    const q = (request.query.q ?? '').trim()
    if (q.length < 2) return reply.send({ users: [], itineraries: [], posts: [] })

    const pattern = `%${q}%`
    const viewerId = request.user?.id ?? null

    const [usersRes, itiRes, postsRes] = await Promise.all([
      query(
        `SELECT id, username, display_name, avatar_url, is_verified, is_private,
          COUNT(DISTINCT f.follower_id) AS followers_count
         FROM users u
         LEFT JOIN follows f ON f.following_id = u.id
         WHERE lower(username) % lower($1) OR lower(display_name) % lower($1)
            OR lower(username) LIKE lower($2) OR lower(display_name) LIKE lower($2)
         GROUP BY u.id
         ORDER BY
           (lower(username) = lower($1))::int DESC,
           similarity(lower(username), lower($1)) DESC,
           followers_count DESC
         LIMIT 10`,
        [q, pattern],
      ),
      query(
        `SELECT id, title, destination, cover_url, saves_count, views_count
         FROM itineraries
         WHERE is_public = TRUE AND (
           lower(title) % lower($1) OR lower(destination) % lower($1)
           OR lower(title) LIKE lower($2) OR lower(destination) LIKE lower($2)
         )
         ORDER BY
           similarity(lower(title), lower($1)) DESC,
           saves_count DESC
         LIMIT 10`,
        [q, pattern],
      ),
      query(
        `SELECT p.id, p.images, p.caption,
          COUNT(pl.user_id) AS likes_count
         FROM posts p
         LEFT JOIN post_likes pl ON pl.post_id = p.id
         WHERE lower(p.caption) % lower($1) OR lower(p.destination) % lower($1)
            OR lower(p.caption) LIKE lower($2) OR lower(p.destination) LIKE lower($2)
         GROUP BY p.id
         ORDER BY
           similarity(lower(p.caption), lower($1)) DESC,
           likes_count DESC
         LIMIT 12`,
        [q, pattern],
      ),
    ])

    reply.header('Server-Timing', `db;dur=${Date.now() - t0}`)
    return reply.send({
      users: usersRes.rows.map((u) => ({
        id:             u.id,
        username:       u.username,
        displayName:    u.display_name ?? u.username,
        avatarUrl:      u.avatar_url,
        isVerified:     u.is_verified,
        isPrivate:      u.is_private,
        followersCount: Number(u.followers_count),
      })),
      itineraries: itiRes.rows.map((it) => ({
        id:          it.id,
        title:       it.title,
        destination: it.destination,
        coverUrl:    it.cover_url,
        savesCount:  Number(it.saves_count),
        viewsCount:  Number(it.views_count),
      })),
      posts: postsRes.rows.map((p) => ({
        id:         p.id,
        images:     p.images ?? [],
        caption:    p.caption,
        likesCount: Number(p.likes_count),
      })),
    })
  })
}
