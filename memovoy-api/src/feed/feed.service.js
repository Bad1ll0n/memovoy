// src/feed/feed.service.js
// Feed social: timeline personalizada + descoberta global.
//
// Estratégia de fan-out:
//   < 10k seguidores  → fan-out on write (push para Redis ao publicar)
//   ≥ 10k seguidores  → fan-out on read  (merge em tempo real)
// Para o MVP usamos fan-out on read simplificado — sem Redis ainda.
// A arquitectura está preparada para adicionar Redis sem breaking changes.

import { NotFoundError } from '../shared/errors/index.js'

// Número de posts por página
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

export class FeedService {
  constructor(db, cache = null) {
    this.db    = db
    this.cache = cache  // null → sem cache (testes, fallback)
  }

  // -------------------------------------------------------
  // Feed personalizado — posts de quem o utilizador segue
  // Cursor-based pagination (mais eficiente que offset em feeds)
  // cursor = created_at do último post visto
  // -------------------------------------------------------
  async getPersonalizedFeed(userId, role, { cursor, limit = DEFAULT_LIMIT }) {
    limit = Math.min(limit, MAX_LIMIT)

    const posts = await this.db.withUser(userId, role, async (sql) => {
      return sql`
        SELECT
          p.id,
          p.user_id,
          p.itinerary_id,
          p.caption,
          p.location_name,
          ST_X(p.location_geo::geometry) AS location_lng,
          ST_Y(p.location_geo::geometry) AS location_lat,
          p.country_code,
          p.likes_count,
          p.comments_count,
          p.saves_count,
          p.created_at,
          -- Autor
          u.username,
          up.display_name,
          up.avatar_url,
          up.level,
          -- Media (primeiro item para thumbnail)
          (
            SELECT jsonb_build_object(
              'url', pm.url,
              'thumbnail_url', pm.thumbnail_url,
              'media_type', pm.media_type,
              'width', pm.width,
              'height', pm.height
            )
            FROM post_media pm
            WHERE pm.post_id = p.id
            ORDER BY pm.position ASC
            LIMIT 1
          ) AS cover_media,
          -- Total de media
          (SELECT COUNT(*) FROM post_media pm WHERE pm.post_id = p.id) AS media_count,
          -- Estado do viewer
          EXISTS(
            SELECT 1 FROM reactions r
            WHERE r.user_id = ${userId}
              AND r.target_id = p.id
              AND r.target_type = 'post'
          ) AS viewer_liked,
          EXISTS(
            SELECT 1 FROM saves s
            WHERE s.user_id = ${userId}
              AND s.itinerary_id = p.itinerary_id
          ) AS viewer_saved
        FROM posts p
        JOIN users u      ON u.id = p.user_id
        JOIN user_profiles up ON up.user_id = p.user_id
        -- Só posts de quem o utilizador segue
        JOIN follows f ON f.following_id = p.user_id
          AND f.follower_id = ${userId}
          AND f.status = 'active'
        WHERE
          p.deleted_at IS NULL
          AND p.is_hidden = false
          AND p.visibility IN ('public', 'followers')
          -- Cursor para paginação (mais antigo que o último visto)
          ${cursor ? sql`AND p.created_at < ${cursor}::timestamptz` : sql``}
        ORDER BY p.created_at DESC
        LIMIT ${limit + 1}
      `
    })

    return this._paginateWithCursor(posts, limit, 'created_at')
  }

  // -------------------------------------------------------
  // Feed de descoberta — posts públicos populares
  // Para utilizadores sem seguidores ou como aba "Explorar"
  // -------------------------------------------------------
  async getDiscoveryFeed(viewerId, { cursor, limit = DEFAULT_LIMIT, countryCode }) {
    limit = Math.min(limit, MAX_LIMIT)

    // Cache apenas para a primeira página sem cursor e sem utilizador autenticado
    // (viewer_liked/viewer_saved seriam incorrectos para outros utilizadores)
    const canCache = !cursor && !viewerId && limit <= DEFAULT_LIMIT
    if (canCache && this.cache) {
      const key = this.cache.keys.discovery(countryCode)
      const { data, fromCache } = await this.cache.wrap(
        key,
        this.cache.isAvailable ? 60 : 0, // TTL 60s
        () => this._queryDiscoveryFeed(viewerId, { cursor, limit, countryCode })
      )
      return data
    }

    return this._queryDiscoveryFeed(viewerId, { cursor, limit, countryCode })
  }

  async _queryDiscoveryFeed(viewerId, { cursor, limit = DEFAULT_LIMIT, countryCode }) {
    limit = Math.min(limit, MAX_LIMIT)
    const { sql } = this.db

    const posts = await sql`
      SELECT
        p.id,
        p.user_id,
        p.itinerary_id,
        p.caption,
        p.location_name,
        p.country_code,
        p.likes_count,
        p.comments_count,
        p.saves_count,
        p.created_at,
        u.username,
        up.display_name,
        up.avatar_url,
        up.level,
        (
          SELECT jsonb_build_object(
            'url', pm.url,
            'thumbnail_url', pm.thumbnail_url,
            'media_type', pm.media_type,
            'width', pm.width,
            'height', pm.height
          )
          FROM post_media pm
          WHERE pm.post_id = p.id
          ORDER BY pm.position ASC
          LIMIT 1
        ) AS cover_media,
        (SELECT COUNT(*) FROM post_media pm WHERE pm.post_id = p.id) AS media_count,
        -- Viewer: liked e saved (só se autenticado)
        ${viewerId ? sql`
          EXISTS(
            SELECT 1 FROM reactions r
            WHERE r.user_id = ${viewerId}
              AND r.target_id = p.id
              AND r.target_type = 'post'
          ) AS viewer_liked,
          EXISTS(
            SELECT 1 FROM saves s
            WHERE s.user_id = ${viewerId}
              AND s.itinerary_id = p.itinerary_id
          ) AS viewer_saved
        ` : sql`
          false AS viewer_liked,
          false AS viewer_saved
        `}
      FROM posts p
      JOIN users u         ON u.id = p.user_id
      JOIN user_profiles up ON up.user_id = p.user_id
      WHERE
        p.deleted_at IS NULL
        AND p.is_hidden = false
        AND p.visibility = 'public'
        -- Filtro opcional por país
        ${countryCode ? sql`AND p.country_code = ${countryCode.toUpperCase()}` : sql``}
        -- Cursor
        ${cursor ? sql`AND p.created_at < ${cursor}::timestamptz` : sql``}
        -- Excluir posts do próprio viewer (já aparecem no feed pessoal)
        ${viewerId ? sql`AND p.user_id != ${viewerId}` : sql``}
      ORDER BY
        -- Score de relevância: likes recentes + tempo
        (p.likes_count * 0.7 + p.comments_count * 0.3) /
        GREATEST(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600.0, 1) DESC,
        p.created_at DESC
      LIMIT ${limit + 1}
    `

    return this._paginateWithCursor(posts, limit, 'created_at')
  }

  // -------------------------------------------------------
  // Feed de um utilizador específico (ecrã de perfil)
  // -------------------------------------------------------
  async getUserFeed(targetUserId, viewerId, viewerRole, { cursor, limit = DEFAULT_LIMIT }) {
    limit = Math.min(limit, MAX_LIMIT)
    const { sql } = this.db

    // Verificar visibilidade do perfil
    const [target] = await sql`
      SELECT id, is_private FROM users
      WHERE id = ${targetUserId} AND deleted_at IS NULL
      LIMIT 1
    `
    if (!target) throw new NotFoundError('Utilizador')

    // Verificar se pode ver conteúdo privado
    let canSeeFollowersOnly = false
    if (target.is_private && viewerId !== targetUserId) {
      const [follow] = await sql`
        SELECT 1 FROM follows
        WHERE follower_id = ${viewerId}
          AND following_id = ${targetUserId}
          AND status = 'active'
        LIMIT 1
      `
      canSeeFollowersOnly = !!follow
    } else {
      canSeeFollowersOnly = true
    }

    const isOwner = viewerId === targetUserId

    const posts = await sql`
      SELECT
        p.id,
        p.user_id,
        p.itinerary_id,
        p.caption,
        p.location_name,
        p.country_code,
        p.likes_count,
        p.comments_count,
        p.saves_count,
        p.visibility,
        p.created_at,
        (
          SELECT jsonb_build_object(
            'url', pm.url,
            'thumbnail_url', pm.thumbnail_url,
            'media_type', pm.media_type,
            'width', pm.width,
            'height', pm.height
          )
          FROM post_media pm
          WHERE pm.post_id = p.id
          ORDER BY pm.position ASC
          LIMIT 1
        ) AS cover_media,
        (SELECT COUNT(*) FROM post_media pm WHERE pm.post_id = p.id) AS media_count,
        ${viewerId ? sql`
          EXISTS(
            SELECT 1 FROM reactions r
            WHERE r.user_id = ${viewerId}
              AND r.target_id = p.id
              AND r.target_type = 'post'
          ) AS viewer_liked
        ` : sql`false AS viewer_liked`}
      FROM posts p
      WHERE
        p.user_id = ${targetUserId}
        AND p.deleted_at IS NULL
        AND p.is_hidden = false
        AND (
          -- Dono vê tudo
          ${isOwner ? sql`true` : sql`
            p.visibility = 'public'
            OR (p.visibility = 'followers' AND ${canSeeFollowersOnly})
          `}
        )
        ${cursor ? sql`AND p.created_at < ${cursor}::timestamptz` : sql``}
      ORDER BY p.created_at DESC
      LIMIT ${limit + 1}
    `

    return this._paginateWithCursor(posts, limit, 'created_at')
  }

  // -------------------------------------------------------
  // Top países do mês (homepage)
  // -------------------------------------------------------
  async getTopCountries() {
    if (this.cache) {
      const key = this.cache.keys.topCountries()
      const { data } = await this.cache.wrap(
        key,
        3600, // 1 hora
        () => this._queryTopCountries()
      )
      return data
    }
    return this._queryTopCountries()
  }

  async _queryTopCountries() {
    const { sql } = this.db
    return sql`SELECT * FROM get_top_countries()`
  }

  // -------------------------------------------------------
  // Helper: cursor pagination
  // Pede limit+1, se tiver mais → há próxima página
  // -------------------------------------------------------
  _paginateWithCursor(rows, limit, cursorField) {
    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows
    const nextCursor = hasMore
      ? items[items.length - 1][cursorField]?.toISOString()
      : null

    return { items, hasMore, nextCursor }
  }
}
