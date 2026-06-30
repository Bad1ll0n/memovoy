// src/notifications/notifications.routes.js
// Prefixo: /notifications

import { z } from 'zod'
import { NotificationsService } from './notifications.service.js'
import { authenticate }         from '../middleware/auth.js'
import { ValidationError }      from '../shared/errors/index.js'

const registerDeviceSchema = z.object({
  deviceId:   z.string().min(1).max(200),
  platform:   z.enum(['ios', 'android', 'web']),
  pushToken:  z.string().min(1).max(500).optional().nullable(),
  deviceName: z.string().max(100).optional().nullable(),
})

export default async function notificationsRoutes(fastify) {
  const svc = new NotificationsService(fastify.db)

  // -----------------------------------------------------------------------
  // GET /notifications — listar notificações com paginação
  // -----------------------------------------------------------------------
  fastify.get('/', {
    preHandler: [authenticate],
  }, async (request) => {
    const { sub: userId, role } = request.user
    const { cursor, limit, unread } = request.query

    return svc.list(userId, role, {
      cursor:     cursor ?? null,
      limit:      parseInt(limit ?? 30),
      unreadOnly: unread === 'true',
    })
  })

  // -----------------------------------------------------------------------
  // GET /notifications/unread-count — badge count
  // Endpoint leve chamado frequentemente pela UI — sem paginação.
  // -----------------------------------------------------------------------
  fastify.get('/unread-count', {
    preHandler: [authenticate],
  }, async (request) => {
    const { sub: userId, role } = request.user
    const count = await svc.unreadCount(userId, role)
    return { count }
  })

  // -----------------------------------------------------------------------
  // PATCH /notifications/:id/read — marcar uma notificação como lida
  // -----------------------------------------------------------------------
  fastify.patch('/:id/read', {
    preHandler: [authenticate],
  }, async (request) => {
    const { sub: userId, role } = request.user
    return svc.markRead(request.params.id, userId, role)
  })

  // -----------------------------------------------------------------------
  // PATCH /notifications/read-all — marcar todas como lidas
  // -----------------------------------------------------------------------
  fastify.patch('/read-all', {
    preHandler: [authenticate],
  }, async (request) => {
    const { sub: userId, role } = request.user
    return svc.markAllRead(userId, role)
  })

  // -----------------------------------------------------------------------
  // POST /notifications/devices — registar push token de dispositivo
  // Chamado pela app móvel após login para habilitar push notifications.
  // -----------------------------------------------------------------------
  fastify.post('/devices', {
    preHandler: [authenticate],
  }, async (request) => {
    const parsed = registerDeviceSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Dados inválidos', parsed.error.flatten())
    }

    const { sub: userId, role } = request.user
    return svc.registerDevice(userId, role, parsed.data)
  })
}
