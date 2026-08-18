import { query } from '../db/pool.js'
import { sendPushToUser } from './webPush.js'

/**
 * Create a DB notification, emit a socket event, and fire a web push.
 * All three are best-effort — failure in one doesn't abort the others.
 */
export async function notifyUser({ recipientId, actorId = null, type, message, targetUrl = null }) {
  if (!recipientId) return

  // Insert into DB
  await query(
    `INSERT INTO notifications (recipient_id, actor_id, type, message, target_url)
     VALUES ($1, $2, $3, $4, $5)`,
    [recipientId, actorId, type, message, targetUrl],
  )

  // Socket event (real-time if user is online)
  if (global._io) {
    global._io.to(`user:${recipientId}`).emit('new_notification', { type })
  }

  // Web push (works even when browser is closed)
  sendPushToUser(recipientId, {
    title: 'Memovoy',
    body:  message,
    url:   targetUrl ?? '/notifications',
  }).catch(() => {})
}
