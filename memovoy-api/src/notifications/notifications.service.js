// src/notifications/notifications.service.js
// Gestão de notificações in-app + push.
//
// Arquitectura:
//   - Notificações criadas sincronamente na BD (status='pending')
//   - Envio push é assíncrono — um worker (Kafka consumer ou cron)
//     lê notificações pending e envia via FCM/APNs
//   - Este service trata: criar, listar, marcar lida, marcar todas lidas
//   - Envio push real: fora do scope do MVP (worker separado)
//
// Assumption: push tokens estão em user_devices.push_token.

import { NotFoundError, ForbiddenError } from '../shared/errors/index.js'

// Máximo de notificações por página
const PAGE_LIMIT = 30

export class NotificationsService {
  constructor(db) {
    this.db = db
  }

  // -------------------------------------------------------------------------
  // list — notificações do utilizador autenticado
  // Cursor-based pagination por created_at DESC.
  // Separa lidas de não-lidas para a UI poder mostrar badge count correctamente.
  // -------------------------------------------------------------------------
  async list(userId, role, { cursor, limit = PAGE_LIMIT, unreadOnly = false }) {
    limit = Math.min(limit, PAGE_LIMIT)

    return this.db.withUser(userId, role, async (sql) => {
      const rows = await sql`
        SELECT
          id, type, title, body, data, channel,
          status, read_at, sent_at, created_at
        FROM notifications
        WHERE user_id = ${userId}
          ${unreadOnly ? sql`AND read_at IS NULL` : sql``}
          ${cursor ? sql`AND created_at < ${cursor}::timestamptz` : sql``}
        ORDER BY created_at DESC
        LIMIT ${limit + 1}
      `

      const hasMore = rows.length > limit
      const items   = hasMore ? rows.slice(0, limit) : rows
      const nextCursor = hasMore
        ? items[items.length - 1].created_at?.toISOString()
        : null

      return { items, hasMore, nextCursor }
    })
  }

  // -------------------------------------------------------------------------
  // unreadCount — badge count para o ícone de notificações
  // Query leve: usa idx_notifications_user_unread directamente.
  // -------------------------------------------------------------------------
  async unreadCount(userId, role) {
    return this.db.withUser(userId, role, async (sql) => {
      const [{ count }] = await sql`
        SELECT COUNT(*) AS count
        FROM notifications
        WHERE user_id  = ${userId}
          AND read_at  IS NULL
          AND status   = 'sent'
      `
      return parseInt(count)
    })
  }

  // -------------------------------------------------------------------------
  // markRead — marcar uma notificação específica como lida
  // Verifica ownership — um utilizador não pode marcar notificações alheias.
  // -------------------------------------------------------------------------
  async markRead(notificationId, userId, role) {
    return this.db.withUser(userId, role, async (sql) => {
      const [result] = await sql`
        UPDATE notifications
        SET read_at = NOW(), status = 'read'
        WHERE id      = ${notificationId}
          AND user_id = ${userId}
          AND read_at IS NULL
        RETURNING id
      `
      // Silencioso se já estava lida — idempotente
      return { ok: true, alreadyRead: !result }
    })
  }

  // -------------------------------------------------------------------------
  // markAllRead — marcar todas as notificações como lidas
  // Operação em batch — mais eficiente que loop de markRead.
  // -------------------------------------------------------------------------
  async markAllRead(userId, role) {
    return this.db.withUser(userId, role, async (sql) => {
      const result = await sql`
        UPDATE notifications
        SET read_at = NOW(), status = 'read'
        WHERE user_id = ${userId}
          AND read_at IS NULL
        RETURNING id
      `
      return { markedCount: result.length }
    })
  }

  // -------------------------------------------------------------------------
  // create — criar notificação (chamado internamente por outros services)
  // Não é exposto directamente como endpoint público.
  // fire-and-forget: quem chama não espera pelo resultado.
  // -------------------------------------------------------------------------
  async create(sql, { userId, type, title, body = null, data = null, channel = 'in_app' }) {
    // Validar tipo — defesa em profundidade mesmo sendo chamada interna
    const validTypes = [
      'like','comment','follow','follow_request',
      'challenge_complete','badge_earned',
      'geo_alert','day_summary','itinerary_ready',
      'session_suspicious','carbon_milestone','system',
    ]
    if (!validTypes.includes(type)) {
      throw new Error(`Tipo de notificação inválido: ${type}`)
    }

    const [notification] = await sql`
      INSERT INTO notifications (user_id, type, title, body, data, channel, status)
      VALUES (
        ${userId}, ${type}, ${title}, ${body},
        ${data ? JSON.stringify(data) : null},
        ${channel}, 'pending'
      )
      RETURNING id, type, title, created_at
    `
    return notification
  }

  // -------------------------------------------------------------------------
  // registerDevice — registar ou actualizar push token de um dispositivo
  // Chamado após login bem-sucedido na app móvel.
  // -------------------------------------------------------------------------
  async registerDevice(userId, role, { deviceId, platform, pushToken, deviceName }) {
    return this.db.withUser(userId, role, async (sql) => {
      await sql`
        INSERT INTO user_devices (
          user_id, device_id, platform, push_token,
          push_token_updated_at, device_name, last_seen_at
        ) VALUES (
          ${userId}, ${deviceId}, ${platform}, ${pushToken ?? null},
          ${pushToken ? sql`NOW()` : null},
          ${deviceName ?? null}, NOW()
        )
        ON CONFLICT (device_id, user_id) DO UPDATE SET
          push_token            = EXCLUDED.push_token,
          push_token_updated_at = CASE
            WHEN EXCLUDED.push_token IS NOT NULL THEN NOW()
            ELSE user_devices.push_token_updated_at
          END,
          device_name = COALESCE(EXCLUDED.device_name, user_devices.device_name),
          last_seen_at = NOW()
      `
      return { ok: true }
    })
  }
}
