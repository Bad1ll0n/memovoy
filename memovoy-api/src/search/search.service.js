// src/search/search.service.js
// Pesquisa full-text de roteiros, utilizadores e posts.
//
// Tecnologia: pg_trgm (já instalado na V1) + índices GIN existentes
// Sem Elasticsearch — pg_trgm é suficiente até ~10M registos.
//
// Estratégia:
//   - similarity() para tolerância a erros de digitação (typos)
//   - ts_vector para pesquisa de frases exactas
//   - Pesos por campo: título (A) > destino (B) > caption (C)
//   - Resultados combinados e re-ordenados por relevância + popularidade

export class SearchService {
  constructor(db) {
    this.db = db
  }

  // -------------------------------------------------------------------------
  // search — pesquisa global (itinerários + utilizadores)
  // -------------------------------------------------------------------------
  async search(query, { limit = 20, type = 'all' } = {}) {
    if (!query || query.trim().length < 2) {
      return { itineraries: [], users: [], posts: [] }
    }

    const q       = query.trim()
    const results = {}

    const [itineraries, users, posts] = await Promise.all([
      type === 'all' || type === 'itineraries'
        ? this._searchItineraries(q, limit)
        : Promise.resolve([]),
      type === 'all' || type === 'users'
        ? this._searchUsers(q, Math.min(limit, 10))
        : Promise.resolve([]),
      type === 'all' || type === 'posts'
        ? this._searchPosts(q, limit)
        : Promise.resolve([]),
    ])

    return { itineraries, users, posts }
  }

  // -------------------------------------------------------------------------
  // _searchItineraries
  // Combina pg_trgm similarity com ts_vector para melhor recall.
  // Campos pesquisados: title (peso 1.0), destination_name (0.8), travel_styles (0.5)
  // -------------------------------------------------------------------------
  async _searchItineraries(query, limit) {
    const { sql } = this.db

    return sql`
      SELECT
        i.id,
        i.title,
        i.destination_name,
        i.country_code,
        i.start_date,
        i.end_date,
        i.duration_days,
        i.group_type,
        i.cover_image_url,
        i.saves_count,
        i.views_count,
        i.published_at,
        i.ai_generated,
        up.display_name AS author_name,
        up.avatar_url   AS author_avatar,
        -- Score de relevância composto
        (
          -- Similaridade trigrama no título (mais peso)
          similarity(i.title, ${query}) * 1.0
          -- Similaridade no destino
          + similarity(i.destination_name, ${query}) * 0.8
          -- Boost por popularidade (normalizado)
          + LEAST(i.saves_count::float / 100, 0.3)
          -- Boost por recência (roteiros recentes)
          + CASE
              WHEN i.published_at > NOW() - INTERVAL '30 days' THEN 0.2
              WHEN i.published_at > NOW() - INTERVAL '90 days' THEN 0.1
              ELSE 0
            END
        ) AS relevance_score
      FROM itineraries i
      JOIN user_profiles up ON up.user_id = i.user_id
      WHERE
        i.status = 'published'
        AND i.deleted_at IS NULL
        AND i.visibility = 'public'
        AND (
          -- pg_trgm: similaridade mínima 0.2 (tolerante a typos)
          similarity(i.title, ${query}) > 0.2
          OR similarity(i.destination_name, ${query}) > 0.2
          OR i.country_code ILIKE ${query + '%'}
          -- ts_vector: pesquisa de texto completo
          OR to_tsvector('portuguese', i.title || ' ' || i.destination_name)
             @@ plainto_tsquery('portuguese', ${query})
        )
      ORDER BY relevance_score DESC, i.saves_count DESC
      LIMIT ${limit}
    `
  }

  // -------------------------------------------------------------------------
  // _searchUsers — pesquisa por username e display_name
  // -------------------------------------------------------------------------
  async _searchUsers(query, limit) {
    const { sql } = this.db

    return sql`
      SELECT
        u.id,
        u.username,
        u.is_verified,
        u.is_private,
        u.follower_count,
        up.display_name,
        up.avatar_url,
        up.total_trips,
        up.level,
        -- Score: exact match primeiro, depois similarity
        CASE
          WHEN u.username ILIKE ${query}         THEN 1.0
          WHEN u.username ILIKE ${query + '%'}   THEN 0.9
          WHEN up.display_name ILIKE ${query + '%'} THEN 0.8
          ELSE similarity(u.username, ${query}) * 0.7
               + similarity(up.display_name, ${query}) * 0.3
        END AS relevance_score
      FROM users u
      JOIN user_profiles up ON up.user_id = u.id
      WHERE
        u.deleted_at IS NULL
        AND (
          u.username ILIKE ${'%' + query + '%'}
          OR up.display_name ILIKE ${'%' + query + '%'}
          OR similarity(u.username, ${query}) > 0.3
        )
      ORDER BY relevance_score DESC, u.follower_count DESC
      LIMIT ${limit}
    `
  }

  // -------------------------------------------------------------------------
  // _searchPosts — pesquisa em captions e localização
  // -------------------------------------------------------------------------
  async _searchPosts(query, limit) {
    const { sql } = this.db

    return sql`
      SELECT
        p.id,
        p.caption,
        p.location_name,
        p.country_code,
        p.likes_count,
        p.comments_count,
        p.created_at,
        u.username,
        up.display_name,
        up.avatar_url,
        (
          SELECT jsonb_build_object(
            'url',          pm.url,
            'thumbnail_url', pm.thumbnail_url,
            'media_type',   pm.media_type
          )
          FROM post_media pm
          WHERE pm.post_id = p.id
          ORDER BY pm.position ASC
          LIMIT 1
        ) AS cover_media,
        (
          similarity(COALESCE(p.caption, ''), ${query}) * 0.7
          + similarity(COALESCE(p.location_name, ''), ${query}) * 0.5
          + LEAST(p.likes_count::float / 1000, 0.3)
        ) AS relevance_score
      FROM posts p
      JOIN users u          ON u.id = p.user_id
      JOIN user_profiles up ON up.user_id = p.user_id
      WHERE
        p.deleted_at IS NULL
        AND p.is_hidden = false
        AND p.visibility = 'public'
        AND (
          p.caption ILIKE ${'%' + query + '%'}
          OR p.location_name ILIKE ${'%' + query + '%'}
          OR similarity(COALESCE(p.caption, ''), ${query}) > 0.25
        )
      ORDER BY relevance_score DESC, p.likes_count DESC
      LIMIT ${limit}
    `
  }

  // -------------------------------------------------------------------------
  // autocomplete — sugestões rápidas enquanto o utilizador digita
  // Devolve apenas os 5 destinos + 3 utilizadores mais relevantes.
  // Optimizado para latência baixa (< 100ms) — sem ts_vector.
  // -------------------------------------------------------------------------
  async autocomplete(prefix) {
    if (!prefix || prefix.length < 2) return { destinations: [], users: [] }

    const { sql } = this.db
    const p = prefix.trim()

    const [destinations, users] = await Promise.all([
      sql`
        SELECT DISTINCT
          destination_name,
          country_code,
          COUNT(*) AS trip_count
        FROM itineraries
        WHERE status = 'published'
          AND deleted_at IS NULL
          AND destination_name ILIKE ${p + '%'}
        GROUP BY destination_name, country_code
        ORDER BY trip_count DESC
        LIMIT 5
      `,
      sql`
        SELECT
          u.id,
          u.username,
          up.display_name,
          up.avatar_url,
          up.level,
          u.follower_count,
          u.is_verified
        FROM users u
        JOIN user_profiles up ON up.user_id = u.id
        WHERE u.deleted_at IS NULL
          AND (
            u.username ILIKE ${p + '%'}
            OR up.display_name ILIKE ${p + '%'}
          )
        ORDER BY u.follower_count DESC
        LIMIT 3
      `,
    ])

    return { destinations, users }
  }
}
