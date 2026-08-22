import webPush from 'web-push'
import { query } from '../db/pool.js'
import { emSegundoPlano } from '../lib/emSegundoPlano.js'

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY
const VAPID_EMAIL   = process.env.VAPID_EMAIL ?? 'mailto:admin@memovoy.com'

let configured = false

export function configureWebPush() {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return
  webPush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE)
  configured = true
}

export function getVapidPublicKey() {
  return VAPID_PUBLIC ?? null
}

/**
 * Send a push notification to all subscriptions for a user.
 * Fire-and-forget — expired subscriptions are cleaned up automatically.
 */
export async function sendPushToUser(userId, payload) {
  if (!configured) return
  const { rows } = await query(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
    [userId],
  )
  if (rows.length === 0) return

  const message = JSON.stringify(payload)
  const stale = []

  await Promise.allSettled(
    rows.map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message,
        )
      } catch (err) {
        // 404 / 410 = subscription expired or unsubscribed
        if (err.statusCode === 404 || err.statusCode === 410) stale.push(sub.id)
      }
    }),
  )

  if (stale.length > 0) {
    // Apaga de push_subscriptions, que referencia users. Chegar depois de a
    // limpeza dos testes apagar os utilizadores dava exactamente as violações
    // de chave estrangeira que andámos a perseguir.
    emSegundoPlano(query(
      `DELETE FROM push_subscriptions WHERE id = ANY($1::uuid[])`,
      [stale],
    ))
  }
}
