import { query } from '../db/pool.js'
import { agentSuggestDestinations } from '../services/aiAgent.js'

export async function exploreRoutes(app) {
  // GET /explore/for-you — personalized itinerary suggestions
  app.get('/for-you', { preHandler: [app.authenticate] }, async (request, reply) => {
    const userId = request.user.id

    // Fetch user's past destinations and travel styles
    const { rows: userHistory } = await query(
      `SELECT DISTINCT ON (destination) destination, travel_style
       FROM itineraries
       WHERE user_id = $1 AND destination IS NOT NULL
       ORDER BY destination, created_at DESC
       LIMIT 10`,
      [userId],
    )

    if (userHistory.length === 0) {
      return reply.send({ itineraries: [], destinations: [] })
    }

    const pastDestinations = [...new Set(userHistory.map((r) => r.destination).filter(Boolean))]
    const allStyles        = userHistory.flatMap((r) => r.travel_style ?? [])
    const styleFreq        = allStyles.reduce((acc, s) => { acc[s] = (acc[s] ?? 0) + 1; return acc }, {})
    const topStyles        = Object.entries(styleFreq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s)

    // Find public itineraries from other users with similar travel styles
    const { rows: similar } = await query(
      `SELECT i.id, i.title, i.destination, i.cover_url, i.start_date, i.end_date,
              COALESCE(jsonb_array_length(i.data->'days'), 0) AS days_count,
              u.username, u.avatar_url
       FROM itineraries i
       JOIN users u ON u.id = i.user_id
       WHERE i.is_public = TRUE
         AND i.user_id <> $1
         AND i.travel_style && $2
         AND i.destination NOT IN (SELECT destination FROM itineraries WHERE user_id = $1 AND destination IS NOT NULL)
       ORDER BY i.saves_count DESC, i.views_count DESC
       LIMIT 6`,
      [userId, topStyles],
    )

    // AI destination suggestions (fire from cache if possible)
    let aiDestinations = []
    try {
      const result = await agentSuggestDestinations({ pastDestinations, travelStyles: topStyles })
      aiDestinations = result.destinations ?? []
    } catch {
      // not critical — return empty
    }

    reply.send({
      itineraries: similar.map((r) => ({
        id:          r.id,
        title:       r.title,
        destination: r.destination,
        coverUrl:    r.cover_url,
        startDate:   r.start_date,
        endDate:     r.end_date,
        daysCount:   Number(r.days_count),
        username:    r.username,
        avatarUrl:   r.avatar_url,
      })),
      destinations: aiDestinations,
    })
  })


  // GET /explore?region=&cursor=
  app.get('/', async (request, reply) => {
    const region   = request.query.region
    const cursor   = request.query.cursor
    const limit    = 24
    const viewerId = request.user?.id ?? null

    const { rows } = await query(
      `SELECT
        p.*,
        u.username, u.display_name, u.avatar_url, u.is_verified,
        COUNT(DISTINCT pl.user_id)  AS likes_count,
        COUNT(DISTINCT pc.id)       AS comments_count,
        EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $3)  AS viewer_liked,
        EXISTS(SELECT 1 FROM bookmarks  WHERE post_id = p.id AND user_id = $3)  AS viewer_saved
       FROM posts p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN post_likes    pl ON pl.post_id = p.id
       LEFT JOIN post_comments pc ON pc.post_id = p.id
       WHERE ($1::text IS NULL OR lower(p.region) = lower($1))
         AND ($2::uuid IS NULL OR p.created_at < (SELECT created_at FROM posts WHERE id = $2))
         AND jsonb_array_length(p.images) > 0
       GROUP BY p.id, u.id
       ORDER BY p.created_at DESC
       LIMIT $4`,
      [region ?? null, cursor ?? null, viewerId, limit + 1],
    )

    const hasMore = rows.length > limit
    const posts   = rows.slice(0, limit)

    reply.send({
      posts: posts.map((row) => ({
        id:            row.id,
        userId:        row.user_id,
        username:      row.username,
        displayName:   row.display_name ?? row.username,
        avatarUrl:     row.avatar_url,
        isVerified:    row.is_verified,
        caption:       row.caption,
        images:        row.images ?? [],
        destination:   row.destination,
        likesCount:    Number(row.likes_count),
        commentsCount: Number(row.comments_count),
        viewerLiked:   row.viewer_liked,
        viewerSaved:   row.viewer_saved,
        createdAt:     row.created_at,
      })),
      nextCursor: hasMore ? posts[posts.length - 1].id : null,
    })
  })
}
