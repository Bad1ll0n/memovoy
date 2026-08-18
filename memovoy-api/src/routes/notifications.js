import { z } from 'zod'
import { query } from '../db/pool.js'
import { getVapidPublicKey } from '../services/webPush.js'

const PREFS_POR_OMISSAO = { likes: true, comments: true, follows: true, messages: true }

// Campos opcionais: e um PATCH, faz o que o verbo promete. Antes exigia os
// quatro, o que obrigava o cliente a reenviar tudo para mudar um. .strict()
// para um campo mal escrito dar erro em vez de ser silenciosamente ignorado.
const notifPrefsSchema = z.object({
  likes:    z.boolean().optional(),
  comments: z.boolean().optional(),
  follows:  z.boolean().optional(),
  messages: z.boolean().optional(),
}).strict()

export async function notificationsRoutes(app) {
  // GET /notifications?cursor=
  app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const cursor = request.query.cursor
    const limit  = 20
    const t0     = Date.now()

    const { rows } = await query(
      `SELECT n.*, u.username AS actor_username, u.avatar_url AS actor_avatar_url
       FROM notifications n
       LEFT JOIN users u ON u.id = n.actor_id
       WHERE n.recipient_id = $1
         AND ($2::uuid IS NULL OR n.created_at < (SELECT created_at FROM notifications WHERE id = $2))
       ORDER BY n.created_at DESC
       LIMIT $3`,
      [request.user.id, cursor ?? null, limit + 1],
    )

    const hasMore     = rows.length > limit
    const notifs      = rows.slice(0, limit)

    reply.header('Server-Timing', `db;dur=${Date.now() - t0}`)
    reply.send({
      notifications: notifs.map((n) => ({
        id:        n.id,
        type:      n.type,
        read:      n.read,
        targetUrl: n.target_url,
        message:   n.message,
        createdAt: n.created_at,
        actor:     n.actor_id
          ? { id: n.actor_id, username: n.actor_username, avatarUrl: n.actor_avatar_url }
          : null,
      })),
      nextCursor: hasMore ? notifs[notifs.length - 1].id : null,
    })
  })

  // GET /notifications/unread-count
  app.get('/unread-count', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows } = await query(
      'SELECT COUNT(*) FROM notifications WHERE recipient_id = $1 AND NOT read',
      [request.user.id],
    )
    reply.send({ count: Number(rows[0].count) })
  })

  // PUT /notifications/read-all
  app.put('/read-all', { preHandler: [app.authenticate] }, async (request, reply) => {
    await query(
      'UPDATE notifications SET read = TRUE WHERE recipient_id = $1 AND NOT read',
      [request.user.id],
    )
    reply.send({ ok: true })
  })

  // PUT /notifications/:id/read
  app.put('/:id/read', { preHandler: [app.authenticate] }, async (request, reply) => {
    await query(
      'UPDATE notifications SET read = TRUE WHERE id = $1 AND recipient_id = $2',
      [request.params.id, request.user.id],
    )
    reply.send({ ok: true })
  })

  // GET /notifications/settings — ler preferências de notificação
  app.get('/settings', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { rows } = await query('SELECT notif_prefs FROM users WHERE id = $1', [request.user.id])
    if (rows.length === 0) return reply.status(404).send({ message: 'Utilizador não encontrado.' })
    reply.send({ ...PREFS_POR_OMISSAO, ...(rows[0].notif_prefs ?? {}) })
  })

  // PATCH /notifications/settings — guardar preferências de notificação
  app.patch('/settings', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = notifPrefsSchema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    const { rows } = await query('SELECT notif_prefs FROM users WHERE id = $1', [request.user.id])
    const actuais = rows[0]?.notif_prefs ?? PREFS_POR_OMISSAO
    const novas   = { ...PREFS_POR_OMISSAO, ...actuais, ...parsed.data }

    await query('UPDATE users SET notif_prefs = $1 WHERE id = $2', [JSON.stringify(novas), request.user.id])
    reply.send(novas)
  })

  // GET /notifications/vapid-key — public VAPID key for push subscriptions
  app.get('/vapid-key', async (_request, reply) => {
    const key = getVapidPublicKey()
    if (!key) return reply.status(503).send({ message: 'Push notifications not configured.' })
    reply.send({ publicKey: key })
  })

  // POST /notifications/push-subscribe
  app.post('/push-subscribe', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({
      endpoint: z.string().url().max(500),
      p256dh:   z.string().min(1).max(200),
      auth:     z.string().min(1).max(50),
    })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    await query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh = $3, auth = $4`,
      [request.user.id, parsed.data.endpoint, parsed.data.p256dh, parsed.data.auth],
    )
    reply.status(201).send({ ok: true })
  })

  // DELETE /notifications/push-subscribe
  app.delete('/push-subscribe', { preHandler: [app.authenticate] }, async (request, reply) => {
    const schema = z.object({ endpoint: z.string().url().max(500) })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.status(400).send({ message: parsed.error.errors[0].message })

    await query(
      'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
      [request.user.id, parsed.data.endpoint],
    )
    reply.send({ ok: true })
  })
}
