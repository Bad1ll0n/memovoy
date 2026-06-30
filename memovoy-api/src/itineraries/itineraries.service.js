// src/itineraries/itineraries.service.js
// Lógica de negócio de roteiros.

import { NotFoundError, ForbiddenError, ValidationError } from '../shared/errors/index.js'
import { GamificationService } from '../gamification/gamification.service.js'

export class ItinerariesService {
  constructor(db) {
    this.db = db
  }

  // -------------------------------------------------------
  // Criar roteiro (manual)
  // -------------------------------------------------------
  async create(userId, role, data) {
    const {
      title,
      destinationName,
      destinationLat,
      destinationLng,
      countryCode,
      startDate,
      endDate,
      groupType,
      transportModes,
      budgetPerDay,
      travelStyles,
      visibility = 'public',
    } = data

    return this.db.withUser(userId, role, async (sql) => {
      const [itinerary] = await sql`
        INSERT INTO itineraries (
          user_id,
          title,
          destination_name,
          destination_geo,
          country_code,
          start_date,
          end_date,
          group_type,
          transport_modes,
          budget_per_day,
          travel_styles,
          visibility,
          status
        ) VALUES (
          ${userId},
          ${title},
          ${destinationName},
          ${destinationLat && destinationLng
            ? sql`ST_SetSRID(ST_MakePoint(${destinationLng}, ${destinationLat}), 4326)::geography`
            : null},
          ${countryCode.toUpperCase()},
          ${startDate},
          ${endDate},
          ${groupType},
          ${transportModes ?? []},
          ${budgetPerDay ?? null},
          ${travelStyles ?? []},
          ${visibility},
          'draft'
        )
        RETURNING
          id, title, destination_name, country_code,
          start_date, end_date, duration_days,
          group_type, visibility, status, created_at
      `
      return itinerary
    })
  }

  // -------------------------------------------------------
  // Listar roteiros do utilizador autenticado
  // -------------------------------------------------------
  async listMine(userId, role, { status, page = 1, limit = 20 }) {
    const offset = (page - 1) * limit

    return this.db.withUser(userId, role, async (sql) => {
      const rows = await sql`
        SELECT
          i.id,
          i.title,
          i.destination_name,
          i.country_code,
          i.start_date,
          i.end_date,
          i.duration_days,
          i.group_type,
          i.visibility,
          i.status,
          i.ai_generated,
          i.cover_image_url,
          i.saves_count,
          i.views_count,
          i.published_at,
          i.created_at,
          ic.total_kg_co2,
          ic.vs_avg_pct,
          (SELECT COUNT(*) FROM itinerary_days d WHERE d.itinerary_id = i.id) AS days_count,
          (SELECT COUNT(*) FROM itinerary_activities a
            JOIN itinerary_days d ON d.id = a.day_id
            WHERE d.itinerary_id = i.id AND a.deleted_at IS NULL)            AS activities_count
        FROM itineraries i
        LEFT JOIN itinerary_carbon ic ON ic.itinerary_id = i.id
        WHERE i.user_id = ${userId}
          AND i.deleted_at IS NULL
          ${status ? sql`AND i.status = ${status}` : sql``}
        ORDER BY i.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
      return rows
    })
  }

  // -------------------------------------------------------
  // Buscar roteiro por ID (com dias e actividades)
  // -------------------------------------------------------
  async findById(itineraryId, viewerId, viewerRole) {
    const { sql } = this.db

    const [itinerary] = await sql`
      SELECT
        i.*,
        up.display_name AS author_name,
        up.avatar_url   AS author_avatar,
        ic.total_kg_co2,
        ic.vs_avg_pct,
        ic.transport_kg,
        ic.accommodation_kg
      FROM itineraries i
      JOIN user_profiles up         ON up.user_id = i.user_id
      LEFT JOIN itinerary_carbon ic ON ic.itinerary_id = i.id
      WHERE i.id = ${itineraryId}
        AND i.deleted_at IS NULL
    `

    if (!itinerary) throw new NotFoundError('Roteiro')

    // Controlo de acesso
    const isOwner = viewerId === itinerary.user_id
    const isAdmin = viewerRole === 'admin'

    if (!isOwner && !isAdmin) {
      if (itinerary.status !== 'published') throw new NotFoundError('Roteiro')
      if (itinerary.visibility === 'private') throw new ForbiddenError()
      if (itinerary.visibility === 'followers') {
        if (!viewerId) throw new ForbiddenError('Segue este utilizador para ver o roteiro')
        const [follow] = await sql`
          SELECT 1 FROM follows
          WHERE follower_id = ${viewerId}
            AND following_id = ${itinerary.user_id}
            AND status = 'active'
          LIMIT 1
        `
        if (!follow) throw new ForbiddenError('Segue este utilizador para ver o roteiro')
      }
    }

    // Buscar dias e actividades
    const days = await sql`
      SELECT
        d.id,
        d.day_number,
        d.date,
        d.theme,
        d.notes,
        d.total_distance_m
      FROM itinerary_days d
      WHERE d.itinerary_id = ${itineraryId}
      ORDER BY d.day_number ASC
    `

    const activities = days.length > 0
      ? await sql`
          SELECT
            a.id,
            a.day_id,
            a.position,
            a.name,
            a.category,
            ST_X(a.location::geometry) AS lng,
            ST_Y(a.location::geometry) AS lat,
            a.address,
            a.start_time,
            a.duration_minutes,
            a.notes,
            a.booking_url,
            a.price_estimate,
            a.external_id,
            a.external_source,
            a.ai_suggested,
            a.ai_warning
          FROM itinerary_activities a
          WHERE a.day_id = ANY(${days.map(d => d.id)})
            AND a.deleted_at IS NULL
          ORDER BY a.day_id, a.position ASC
        `
      : []

    // Agregar actividades por dia
    const activitiesByDay = activities.reduce((acc, act) => {
      if (!acc[act.day_id]) acc[act.day_id] = []
      acc[act.day_id].push(act)
      return acc
    }, {})

    // Incrementar views (fire-and-forget, não bloqueia resposta)
    if (!isOwner) {
      sql`
        UPDATE itineraries SET views_count = views_count + 1
        WHERE id = ${itineraryId}
      `.catch(() => {})
    }

    return {
      ...itinerary,
      days: days.map(day => ({
        ...day,
        activities: activitiesByDay[day.id] ?? [],
      })),
    }
  }

  // -------------------------------------------------------
  // Adicionar dia ao roteiro
  // -------------------------------------------------------
  async addDay(itineraryId, userId, role, data) {
    await this._assertOwner(itineraryId, userId)

    return this.db.withUser(userId, role, async (sql) => {
      const [day] = await sql`
        INSERT INTO itinerary_days (itinerary_id, day_number, date, theme, notes)
        VALUES (
          ${itineraryId},
          ${data.dayNumber},
          ${data.date},
          ${data.theme ?? null},
          ${data.notes ?? null}
        )
        RETURNING id, day_number, date, theme, notes
      `
      return day
    })
  }

  // -------------------------------------------------------
  // Adicionar actividade a um dia
  // -------------------------------------------------------
  async addActivity(dayId, userId, role, data) {
    // Verificar que o day pertence a um roteiro do utilizador
    const { sql } = this.db
    const [day] = await sql`
      SELECT d.id, d.itinerary_id FROM itinerary_days d
      JOIN itineraries i ON i.id = d.itinerary_id
      WHERE d.id = ${dayId}
        AND i.user_id = ${userId}
        AND i.deleted_at IS NULL
      LIMIT 1
    `
    if (!day) throw new ForbiddenError('Não tens permissão para editar este dia')

    return this.db.withUser(userId, role, async (tx) => {
      const [activity] = await tx`
        INSERT INTO itinerary_activities (
          day_id, position, name, category,
          location, address, start_time, duration_minutes,
          notes, booking_url, price_estimate,
          external_id, external_source, ai_suggested
        ) VALUES (
          ${dayId},
          ${data.position},
          ${data.name},
          ${data.category ?? null},
          ${data.lat && data.lng
            ? tx`ST_SetSRID(ST_MakePoint(${data.lng}, ${data.lat}), 4326)::geography`
            : null},
          ${data.address ?? null},
          ${data.startTime ?? null},
          ${data.durationMinutes ?? null},
          ${data.notes ?? null},
          ${data.bookingUrl ?? null},
          ${data.priceEstimate ?? null},
          ${data.externalId ?? null},
          ${data.externalSource ?? null},
          ${data.aiSuggested ?? false}
        )
        RETURNING
          id, position, name, category, address,
          start_time, duration_minutes, notes,
          booking_url, price_estimate, ai_suggested
      `
      return activity
    })
  }

  // -------------------------------------------------------
  // Publicar roteiro
  // -------------------------------------------------------
  async publish(itineraryId, userId, role) {
    await this._assertOwner(itineraryId, userId)

    return this.db.withUser(userId, role, async (sql) => {
      const [updated] = await sql`
        UPDATE itineraries
        SET status = 'published', published_at = NOW()
        WHERE id = ${itineraryId}
          AND user_id = ${userId}
          AND status = 'draft'
        RETURNING id, status, published_at
      `
      if (!updated) throw new ValidationError('Roteiro já publicado ou não encontrado')

      // Calcular carbono em background (fire-and-forget)
      sql`SELECT calculate_and_save_carbon(${itineraryId})`.catch(() => {})

      // Avaliar gamificação em background — não bloqueia a resposta
      const gamSvc = new GamificationService(this.db)
      gamSvc.evaluateOnPublish(userId, role, updated).catch(() => {})

      return updated
    })
  }

  // -------------------------------------------------------
  // Soft delete de roteiro
  // -------------------------------------------------------
  async delete(itineraryId, userId, role) {
    await this._assertOwner(itineraryId, userId)

    return this.db.withUser(userId, role, async (sql) => {
      await sql`
        UPDATE itineraries
        SET deleted_at = NOW()
        WHERE id = ${itineraryId}
          AND user_id = ${userId}
      `
    })
  }

  // -------------------------------------------------------
  // Helper privado: verificar que o utilizador é dono
  // -------------------------------------------------------
  async _assertOwner(itineraryId, userId) {
    const { sql } = this.db
    const [row] = await sql`
      SELECT id FROM itineraries
      WHERE id = ${itineraryId}
        AND user_id = ${userId}
        AND deleted_at IS NULL
      LIMIT 1
    `
    if (!row) throw new ForbiddenError('Não tens permissão para editar este roteiro')
    return row
  }
}
