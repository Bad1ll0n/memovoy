import { query } from '../db/pool.js'
import { autorVisivel, autorVisivelPorId, datasDoRoteiro, datasVisiveis } from '../db/visibilidade.js'

export async function feedRoutes(app) {
  // GET /feed?cursor=
  app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const cursor  = request.query.cursor
    const limit   = 10
    const userId  = request.user.id
    const t0      = Date.now()

    const { rows } = await query(
      `SELECT
        p.*,
        u.username, u.display_name, u.avatar_url, u.is_verified,
        -- Subqueries escalares, não JOIN + GROUP BY.
        --
        -- A versão anterior fazia LEFT JOIN a post_likes e a post_comments e
        -- contava com COUNT(DISTINCT). Isso é um produto cartesiano: uma
        -- publicação com 300 gostos e 40 comentários gera 12 000 linhas antes
        -- de o GROUP BY as colapsar, e o LIMIT 10 só se aplica depois disso.
        --
        -- Medido com 2000 publicações, 27 000 gostos e 8000 comentários:
        -- 529 ms e 327 312 linhas no maior nó do plano, contra 1,9 ms e 147
        -- linhas assim. Mesmos resultados nas duas.
        (SELECT COUNT(*) FROM post_likes    WHERE post_id = p.id) AS likes_count,
        (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) AS comments_count,
        EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $1)  AS viewer_liked,
        EXISTS(SELECT 1 FROM bookmarks  WHERE post_id = p.id AND user_id = $1)  AS viewer_saved,
        EXISTS(SELECT 1 FROM follows    WHERE follower_id = $1 AND following_id = p.user_id) AS is_following,
        i.id          AS iti_id,
        i.title       AS iti_title,
        i.destination AS iti_destination,
        ${datasVisiveis('u', 'i', '$1')} AS pode_ver_datas,
        i.start_date  AS iti_start_date,
        i.end_date    AS iti_end_date,
        i.cover_url   AS iti_cover_url,
        COALESCE(jsonb_array_length(i.data->'days'), 0) AS iti_days_count
       FROM posts p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN itineraries   i  ON i.id = p.itinerary_id
       WHERE (
         p.user_id = $1
         OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id = $1)
       )
       AND ($2::uuid IS NULL OR p.created_at < (SELECT created_at FROM posts WHERE id = $2))
       ORDER BY p.created_at DESC
       LIMIT $3`,
      [userId, cursor ?? null, limit + 1],
    )

    const hasMore = rows.length > limit
    let posts     = rows.slice(0, limit)

    // Empty feed — return top public posts as curated content
    let isCurated = false
    if (posts.length === 0 && !cursor) {
      const { rows: topRows } = await query(
        // Os candidatos são limitados às 200 publicações mais recentes antes de
        // se ordenar por popularidade.
        //
        // Ordenar por (SELECT COUNT(*) ...) sobre a tabela inteira obriga a uma
        // subquery por publicação — 2000 delas por pedido, e a crescer com a
        // tabela. Limitar primeiro deixa o trabalho constante, e "popular entre
        // o que é recente" é melhor conteúdo do que "popular desde sempre".
        `WITH candidatos AS (
           SELECT id FROM posts
            WHERE user_id <> $1 AND ${autorVisivelPorId('user_id', '$1')}
            ORDER BY created_at DESC LIMIT 200
         )
         SELECT
          p.*,
          u.username, u.display_name, u.avatar_url, u.is_verified,
          (SELECT COUNT(*) FROM post_likes    WHERE post_id = p.id) AS likes_count,
          (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) AS comments_count,
          EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $1) AS viewer_liked,
          EXISTS(SELECT 1 FROM bookmarks  WHERE post_id = p.id AND user_id = $1) AS viewer_saved,
          FALSE AS is_following,
          i.id          AS iti_id,
          i.title       AS iti_title,
          i.destination AS iti_destination,
          ${datasVisiveis('u', 'i', '$1')} AS pode_ver_datas,
        i.start_date  AS iti_start_date,
          i.end_date    AS iti_end_date,
          i.cover_url   AS iti_cover_url,
          COALESCE(jsonb_array_length(i.data->'days'), 0) AS iti_days_count
         FROM posts p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN itineraries   i  ON i.id = p.itinerary_id
         WHERE p.user_id <> $1
           AND ${autorVisivel('u', '$1')}
           AND p.id IN (SELECT id FROM candidatos)
         ORDER BY (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) DESC, p.created_at DESC
         LIMIT $2`,
        [userId, limit],
      )
      posts = topRows
      isCurated = true
    }

    function postDto(row) {
      return {
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
        isFollowing:   row.is_following,
        createdAt:     row.created_at,
        itineraryLinked: row.iti_id ? {
          id:          row.iti_id,
          title:       row.iti_title,
          destination: row.iti_destination,
          ...datasDoRoteiro(row, 'iti_'),
          coverUrl:    row.iti_cover_url,
          daysCount:   Number(row.iti_days_count ?? 0),
        } : null,
      }
    }

    reply.header('Server-Timing', `db;dur=${Date.now() - t0}`)
    return reply.send({
      posts:      posts.map(postDto),
      nextCursor: hasMore ? posts[posts.length - 1].id : null,
      isCurated,
    })
  })
}
