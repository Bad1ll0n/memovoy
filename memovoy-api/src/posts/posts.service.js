// src/posts/posts.service.js
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../shared/errors/index.js'

export class PostsService {
  constructor(db) {
    this.db = db
  }

  async create(userId, role, data) {
    const { itineraryId, caption, locationName, locationLat, locationLng,
            countryCode, visibility = 'public', media = [] } = data

    // FIX #4: verificar ownership do roteiro antes de associar
    if (itineraryId) {
      const { sql } = this.db
      const [itin] = await sql`
        SELECT id FROM itineraries
        WHERE id = ${itineraryId} AND user_id = ${userId} AND deleted_at IS NULL
        LIMIT 1
      `
      if (!itin) throw new ForbiddenError('Não podes associar um roteiro que não é teu')
    }

    return this.db.withUser(userId, role, async (sql) => {
      const [post] = await sql`
        INSERT INTO posts (
          user_id, itinerary_id, caption,
          location_name, location_geo, country_code, visibility
        ) VALUES (
          ${userId},
          ${itineraryId ?? null},
          ${caption ?? null},
          ${locationName ?? null},
          ${locationLat != null && locationLng != null
            ? sql`ST_SetSRID(ST_MakePoint(${locationLng}, ${locationLat}), 4326)::geography`
            : null},
          ${countryCode?.toUpperCase() ?? null},
          ${visibility}
        )
        RETURNING id, user_id, caption, location_name, country_code,
                  visibility, likes_count, comments_count, created_at
      `

      if (media.length > 0) {
        const mediaRows = media.map((m, i) => ({
          post_id:              post.id,
          position:             i + 1,
          media_type:           m.mediaType,
          url:                  m.url,
          thumbnail_url:        m.thumbnailUrl   ?? null,
          width:                m.width          ?? null,
          height:               m.height         ?? null,
          ai_detected_location: m.aiDetectedLocation ?? null,
          moderation_status:    'pending',
        }))
        await sql`INSERT INTO post_media ${sql(mediaRows)}`
      }

      return { ...post, mediaCount: media.length }
    })
  }

  async findById(postId, viewerId) {
    const { sql } = this.db

    const [post] = await sql`
      SELECT
        p.id, p.user_id, p.itinerary_id, p.caption,
        p.location_name,
        ST_X(p.location_geo::geometry) AS location_lng,
        ST_Y(p.location_geo::geometry) AS location_lat,
        p.country_code, p.visibility, p.likes_count,
        p.comments_count, p.saves_count, p.is_hidden, p.created_at,
        u.username, up.display_name, up.avatar_url, up.level,
        ${viewerId ? sql`
          EXISTS(SELECT 1 FROM reactions r
            WHERE r.user_id = ${viewerId} AND r.target_id = p.id
              AND r.target_type = 'post') AS viewer_liked,
          EXISTS(SELECT 1 FROM saves s
            WHERE s.user_id = ${viewerId} AND s.itinerary_id = p.itinerary_id) AS viewer_saved
        ` : sql`false AS viewer_liked, false AS viewer_saved`}
      FROM posts p
      JOIN users u          ON u.id = p.user_id
      JOIN user_profiles up ON up.user_id = p.user_id
      WHERE p.id = ${postId} AND p.deleted_at IS NULL
      LIMIT 1
    `

    if (!post) throw new NotFoundError('Post')
    // Post oculto: só o dono pode ver
    if (post.is_hidden && post.user_id !== viewerId) throw new NotFoundError('Post')

    const media = await sql`
      SELECT id, position, media_type, url, thumbnail_url,
             width, height, ai_detected_location, moderation_status
      FROM post_media WHERE post_id = ${postId} ORDER BY position ASC
    `

    const comments = await sql`
      SELECT
        c.id, c.user_id, c.parent_comment_id, c.content,
        c.likes_count, c.created_at,
        u.username, up.display_name, up.avatar_url,
        ${viewerId ? sql`
          EXISTS(SELECT 1 FROM reactions r
            WHERE r.user_id = ${viewerId} AND r.target_id = c.id
              AND r.target_type = 'comment') AS viewer_liked
        ` : sql`false AS viewer_liked`},
        (SELECT COUNT(*) FROM comments r
          WHERE r.parent_comment_id = c.id AND r.deleted_at IS NULL) AS reply_count
      FROM comments c
      JOIN users u          ON u.id = c.user_id
      JOIN user_profiles up ON up.user_id = c.user_id
      WHERE c.post_id = ${postId}
        AND c.parent_comment_id IS NULL
        AND c.deleted_at IS NULL AND c.is_hidden = false
      ORDER BY c.created_at ASC LIMIT 30
    `

    return { ...post, media, comments }
  }

  async toggleLike(postId, userId, role) {
    const { sql } = this.db
    const [post] = await sql`
      SELECT id FROM posts WHERE id = ${postId} AND deleted_at IS NULL LIMIT 1
    `
    if (!post) throw new NotFoundError('Post')

    return this.db.withUser(userId, role, async (tx) => {
      const [existing] = await tx`
        SELECT 1 FROM reactions
        WHERE user_id = ${userId} AND target_id = ${postId} AND target_type = 'post'
        LIMIT 1
      `
      if (existing) {
        await tx`
          DELETE FROM reactions
          WHERE user_id = ${userId} AND target_id = ${postId} AND target_type = 'post'
        `
        return { liked: false }
      }
      await tx`
        INSERT INTO reactions (user_id, target_type, target_id)
        VALUES (${userId}, 'post', ${postId})
      `
      return { liked: true }
    })
  }

  async addComment(postId, userId, role, { content, parentCommentId }) {
    const { sql } = this.db
    const [post] = await sql`
      SELECT id FROM posts WHERE id = ${postId} AND deleted_at IS NULL LIMIT 1
    `
    if (!post) throw new NotFoundError('Post')

    if (parentCommentId) {
      const [parent] = await sql`
        SELECT id FROM comments
        WHERE id = ${parentCommentId} AND post_id = ${postId} AND deleted_at IS NULL LIMIT 1
      `
      if (!parent) throw new NotFoundError('Comentário pai')
    }

    return this.db.withUser(userId, role, async (tx) => {
      const [comment] = await tx`
        INSERT INTO comments (post_id, user_id, parent_comment_id, content)
        VALUES (${postId}, ${userId}, ${parentCommentId ?? null}, ${content})
        RETURNING id, post_id, user_id, parent_comment_id, content, created_at
      `
      return comment
    })
  }

  async getReplies(commentId, viewerId) {
    const { sql } = this.db
    return sql`
      SELECT
        c.id, c.user_id, c.content, c.likes_count, c.created_at,
        u.username, up.display_name, up.avatar_url,
        ${viewerId ? sql`
          EXISTS(SELECT 1 FROM reactions r
            WHERE r.user_id = ${viewerId} AND r.target_id = c.id
              AND r.target_type = 'comment') AS viewer_liked
        ` : sql`false AS viewer_liked`}
      FROM comments c
      JOIN users u          ON u.id = c.user_id
      JOIN user_profiles up ON up.user_id = c.user_id
      WHERE c.parent_comment_id = ${commentId}
        AND c.deleted_at IS NULL AND c.is_hidden = false
      ORDER BY c.created_at ASC LIMIT 50
    `
  }

  async report(targetType, targetId, reporterId, role, { category, note }) {
    return this.db.withUser(reporterId, role, async (sql) => {
      try {
        const [report] = await sql`
          INSERT INTO reports (reporter_id, target_type, target_id, category, note)
          VALUES (${reporterId}, ${targetType}, ${targetId}, ${category}, ${note ?? null})
          RETURNING id, status, created_at
        `
        return report
      } catch (err) {
        if (err.code === '23505') throw new ConflictError('Já denunciaste este conteúdo')
        throw err
      }
    })
  }

  async delete(postId, userId, role) {
    return this.db.withUser(userId, role, async (sql) => {
      const [result] = await sql`
        UPDATE posts SET deleted_at = NOW()
        WHERE id = ${postId} AND user_id = ${userId} AND deleted_at IS NULL
        RETURNING id
      `
      if (!result) throw new ForbiddenError('Não tens permissão para eliminar este post')
      return result
    })
  }
}
