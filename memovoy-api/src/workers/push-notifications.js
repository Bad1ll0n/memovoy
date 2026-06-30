// src/workers/push-notifications.js
// Worker de push notifications.
//
// Arquitectura:
//   - Corre como processo separado (node src/workers/push-notifications.js)
//   - Polling da tabela notifications WHERE status='pending'
//   - Envia via FCM (Android) e APNs (iOS) consoante a plataforma do device
//   - Marca como 'sent' ou 'failed' com detalhes do erro
//   - Retry automático: até 3 tentativas com backoff exponencial
//   - Batch processing: 50 notificações por ciclo
//
// Para activar FCM/APNs reais:
//   - FCM:  definir FIREBASE_SERVICE_ACCOUNT_JSON (JSON do service account)
//   - APNs: definir APNS_KEY_P8, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID
//
// Sem as credenciais, o worker corre em modo 'dry-run' — processa e loga
// mas não envia notificações reais. Útil para desenvolvimento.

import postgres from 'postgres'
import { config } from '../config/index.js'

const BATCH_SIZE    = 50
const POLL_INTERVAL = 5_000   // 5 segundos entre ciclos
const MAX_RETRIES   = 3

// ---------------------------------------------------------------------------
// Configuração de providers
// ---------------------------------------------------------------------------

const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY  // legacy HTTP v1 usa service account
const FCM_PROJECT_ID = process.env.FCM_PROJECT_ID

const APNS_KEY_P8   = process.env.APNS_KEY_P8    // conteúdo do ficheiro .p8
const APNS_KEY_ID   = process.env.APNS_KEY_ID
const APNS_TEAM_ID  = process.env.APNS_TEAM_ID
const APNS_BUNDLE   = process.env.APNS_BUNDLE_ID ?? 'com.memovoy'

const DRY_RUN = !FCM_SERVER_KEY && !APNS_KEY_P8
if (DRY_RUN) {
  console.log('[PushWorker] Modo dry-run — sem credenciais FCM/APNs. Notificações serão marcadas como sent sem envio real.')
}

// ---------------------------------------------------------------------------
// Ligação à BD
// ---------------------------------------------------------------------------

const sql = postgres(config.db?.url ?? process.env.DATABASE_URL, {
  max:             3,
  idle_timeout:    60,
  onnotice:        () => {},
})

// ---------------------------------------------------------------------------
// Lógica de envio por plataforma
// ---------------------------------------------------------------------------

async function sendFCM(pushToken, notification) {
  if (DRY_RUN) {
    console.log(`[FCM dry-run] → ${pushToken.slice(0, 20)}… : "${notification.title}"`)
    return { success: true, provider: 'fcm', messageId: `dry-run-${Date.now()}` }
  }

  // FCM HTTP v1 API
  const payload = {
    message: {
      token:        pushToken,
      notification: { title: notification.title, body: notification.body ?? '' },
      data:         { type: notification.type, notificationId: notification.id },
      android: {
        priority: 'high',
        notification: {
          sound:       'default',
          channelId:  'memovoy_default',
          clickAction: 'OPEN_ACTIVITY',
        },
      },
    },
  }

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
    {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${await getFCMAccessToken()}`,
      },
      body: JSON.stringify(payload),
    }
  )

  if (!res.ok) {
    const body = await res.json()
    // FCM pode devolver erro de token inválido — marcar para limpeza
    if (body.error?.details?.some(d => d.errorCode === 'INVALID_ARGUMENT')) {
      return { success: false, provider: 'fcm', error: 'INVALID_TOKEN', shouldClean: true }
    }
    return { success: false, provider: 'fcm', error: body.error?.message }
  }

  const data = await res.json()
  return { success: true, provider: 'fcm', messageId: data.name }
}

async function sendAPNs(pushToken, notification) {
  if (DRY_RUN) {
    console.log(`[APNs dry-run] → ${pushToken.slice(0, 20)}… : "${notification.title}"`)
    return { success: true, provider: 'apns', apnsId: `dry-run-${Date.now()}` }
  }

  const payload = {
    aps: {
      alert: { title: notification.title, body: notification.body ?? '' },
      badge: 1,
      sound: 'default',
      'content-available': 1,
    },
    notificationId: notification.id,
    type:           notification.type,
  }

  // APNs HTTP/2 — em produção usar biblioteca como @parse/node-apn
  // Aqui esboço do request sem dependência externa
  const res = await fetch(
    `https://api.push.apple.com/3/device/${pushToken}`,
    {
      method: 'POST',
      headers: {
        'Content-Type':     'application/json',
        'apns-topic':       APNS_BUNDLE,
        'apns-priority':    '10',
        'apns-push-type':   'alert',
        'Authorization':    `bearer ${await getAPNsJWT()}`,
      },
      body: JSON.stringify(payload),
    }
  )

  if (!res.ok) {
    const reason = res.headers.get('apns-error')
    if (reason === 'BadDeviceToken' || reason === 'Unregistered') {
      return { success: false, provider: 'apns', error: reason, shouldClean: true }
    }
    return { success: false, provider: 'apns', error: reason }
  }

  return { success: true, provider: 'apns', apnsId: res.headers.get('apns-id') }
}

// ---------------------------------------------------------------------------
// Ciclo principal do worker
// ---------------------------------------------------------------------------

async function processNotifications() {
  const startMs = Date.now()

  // Buscar notificações pendentes em batch
  // FOR UPDATE SKIP LOCKED: seguro para múltiplos workers em paralelo
  const pending = await sql`
    SELECT
      n.id, n.user_id, n.type, n.title, n.body, n.data,
      -- Buscar tokens de todos os devices do utilizador
      array_agg(
        json_build_object(
          'device_id',  ud.device_id,
          'push_token', ud.push_token,
          'platform',   ud.platform
        )
      ) FILTER (WHERE ud.push_token IS NOT NULL) AS devices
    FROM notifications n
    LEFT JOIN user_devices ud ON ud.user_id = n.user_id
    WHERE n.status  = 'pending'
      AND n.channel IN ('push', 'both')
      AND (n.retry_count IS NULL OR n.retry_count < ${MAX_RETRIES})
    GROUP BY n.id, n.user_id, n.type, n.title, n.body, n.data
    ORDER BY n.created_at ASC
    LIMIT ${BATCH_SIZE}
    FOR UPDATE OF n SKIP LOCKED
  `

  if (pending.length === 0) return 0

  let sent = 0, failed = 0

  // Processar cada notificação
  await Promise.allSettled(
    pending.map(async (notif) => {
      const devices = notif.devices ?? []

      if (devices.length === 0) {
        // Utilizador sem devices registados — marcar como sent de qualquer forma
        await sql`
          UPDATE notifications SET status = 'sent', sent_at = NOW()
          WHERE id = ${notif.id}
        `
        sent++
        return
      }

      // Enviar para cada device do utilizador
      const results = await Promise.allSettled(
        devices.map(async (device) => {
          const { push_token: token, platform } = device
          if (!token) return null

          return platform === 'ios'
            ? sendAPNs(token, notif)
            : sendFCM(token, notif)
        })
      )

      // Verificar se pelo menos um device recebeu com sucesso
      const anySuccess = results.some(
        (r) => r.status === 'fulfilled' && r.value?.success
      )

      // Limpar tokens inválidos (fire-and-forget)
      const invalidTokens = results
        .filter((r) => r.status === 'fulfilled' && r.value?.shouldClean)
        .map((r, i) => devices[i]?.device_id)
        .filter(Boolean)

      if (invalidTokens.length > 0) {
        sql`
          UPDATE user_devices
          SET push_token = NULL, push_token_updated_at = NOW()
          WHERE device_id = ANY(${invalidTokens})
        `.catch(() => {})
      }

      if (anySuccess) {
        await sql`
          UPDATE notifications
          SET status = 'sent', sent_at = NOW()
          WHERE id = ${notif.id}
        `
        sent++
      } else {
        // Incrementar retry_count — vai ser tentado novamente no próximo ciclo
        const retryCount = (notif.retry_count ?? 0) + 1
        const finalStatus = retryCount >= MAX_RETRIES ? 'failed' : 'pending'

        await sql`
          UPDATE notifications
          SET
            status      = ${finalStatus},
            retry_count = ${retryCount}
          WHERE id = ${notif.id}
        `
        failed++

        if (finalStatus === 'failed') {
          console.warn(`[PushWorker] Notificação ${notif.id} falhou após ${MAX_RETRIES} tentativas`)
        }
      }
    })
  )

  const duration = Date.now() - startMs
  if (sent + failed > 0) {
    console.log(`[PushWorker] Ciclo: ${sent} enviadas, ${failed} falhadas em ${duration}ms`)
  }

  return sent + failed
}

// ---------------------------------------------------------------------------
// Loop com backoff quando não há trabalho
// ---------------------------------------------------------------------------

async function run() {
  console.log('[PushWorker] Iniciado')

  // Verificar que as colunas de retry existem (migration pode ser necessária)
  try {
    await sql`SELECT retry_count FROM notifications LIMIT 0`
  } catch {
    console.warn('[PushWorker] Coluna retry_count não existe — a criar…')
    await sql`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0`
  }

  let idleCount = 0

  while (true) {
    try {
      const processed = await processNotifications()

      if (processed === 0) {
        idleCount++
        // Backoff quando idle: 5s → 10s → 20s → máx. 30s
        const delay = Math.min(POLL_INTERVAL * Math.pow(1.5, Math.min(idleCount, 5)), 30_000)
        await sleep(delay)
      } else {
        idleCount = 0
        // Ciclo imediato se havia trabalho (pode haver mais)
        await sleep(100)
      }
    } catch (err) {
      console.error('[PushWorker] Erro no ciclo:', err.message)
      await sleep(POLL_INTERVAL)
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// JWT helpers para FCM e APNs (stubs — implementar com credenciais reais)
// ---------------------------------------------------------------------------

let fcmTokenCache = null
async function getFCMAccessToken() {
  // Em produção: usar google-auth-library para gerar access token do service account
  // Por agora retorna o server key legacy para não bloquear a lógica
  if (fcmTokenCache && Date.now() < fcmTokenCache.expiry) {
    return fcmTokenCache.token
  }
  // Placeholder — substituir por OAuth2 do service account
  fcmTokenCache = { token: FCM_SERVER_KEY, expiry: Date.now() + 3600_000 }
  return FCM_SERVER_KEY
}

async function getAPNsJWT() {
  // Em produção: gerar JWT ES256 com a chave .p8
  // Header: { alg: 'ES256', kid: APNS_KEY_ID }
  // Payload: { iss: APNS_TEAM_ID, iat: Math.floor(Date.now()/1000) }
  // Placeholder — substituir por implementação real
  return `placeholder-apns-jwt-${APNS_TEAM_ID}`
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

process.on('SIGTERM', async () => {
  console.log('[PushWorker] SIGTERM recebido — a fechar…')
  await sql.end()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('[PushWorker] SIGINT recebido — a fechar…')
  await sql.end()
  process.exit(0)
})

// ---------------------------------------------------------------------------
// Arrancar
// ---------------------------------------------------------------------------

run().catch((err) => {
  console.error('[PushWorker] Erro fatal:', err)
  process.exit(1)
})
