// src/workers/content-moderation.js
// Worker de moderação de conteúdo.
//
// Responsabilidades:
//   1. Processar post_media com moderation_status = 'pending'
//   2. Verificar conteúdo ofensivo via Anthropic Vision API
//   3. Marcar como 'approved' ou 'rejected' com razão
//   4. Posts com media rejeitada → is_hidden = true
//   5. Notificar o utilizador do resultado
//
// Sem ANTHROPIC_API_KEY: corre em modo 'auto-approve'
// (todos os itens pendentes são aprovados automaticamente)
//
// Arquitectura de moderação em 2 níveis:
//   Nível 1: heurísticas rápidas (tamanho, formato, metadados)
//   Nível 2: Claude Vision para conteúdo explícito/ofensivo
//
// O nível 2 só é activado quando:
//   - MODERATION_VISION_ENABLED=true
//   - A media passou no nível 1
//   - O post foi denunciado recentemente (reports)

import postgres from 'postgres'
import { config } from '../config/index.js'

const BATCH_SIZE      = 20
const POLL_INTERVAL   = 10_000   // 10 segundos
const VISION_ENABLED  = process.env.MODERATION_VISION_ENABLED === 'true'
const AUTO_APPROVE    = !config.anthropic?.apiKey || process.env.MODERATION_AUTO_APPROVE === 'true'

const sql = postgres(config.db?.url ?? process.env.DATABASE_URL, {
  max: 2, idle_timeout: 60, onnotice: () => {},
})

if (AUTO_APPROVE) {
  console.log('[Moderation] Modo auto-approve — sem verificação de conteúdo.')
}
if (VISION_ENABLED) {
  console.log('[Moderation] Claude Vision activado para verificação de imagens.')
}

// ---------------------------------------------------------------------------
// Nível 1: heurísticas rápidas (sem chamada à IA)
// ---------------------------------------------------------------------------

function heuristicCheck(media) {
  const issues = []

  // Verificar tipo MIME
  const allowedTypes = ['image', 'video']
  if (!allowedTypes.some((t) => media.media_type?.startsWith(t))) {
    issues.push({ reason: 'INVALID_MEDIA_TYPE', detail: media.media_type })
  }

  // Verificar dimensões mínimas (evitar thumbnails 1x1 de tracking)
  if (media.width && media.height) {
    if (media.width < 50 || media.height < 50) {
      issues.push({ reason: 'DIMENSIONS_TOO_SMALL', detail: `${media.width}x${media.height}` })
    }
  }

  // URL não pode apontar para domínios externos não autorizados
  const allowedDomains = [
    'cdn.memovoy.com',
    'memovoy-media.s3.amazonaws.com',
    'localhost',
    '127.0.0.1',
  ]
  try {
    const url = new URL(media.url)
    if (!allowedDomains.some((d) => url.hostname.endsWith(d))) {
      issues.push({ reason: 'UNAUTHORIZED_DOMAIN', detail: url.hostname })
    }
  } catch {
    issues.push({ reason: 'INVALID_URL', detail: media.url })
  }

  return issues
}

// ---------------------------------------------------------------------------
// Nível 2: Claude Vision para análise de conteúdo
// ---------------------------------------------------------------------------

async function visionCheck(mediaUrl, mediaType) {
  // Só analisar imagens (não vídeos — muito mais complexo)
  if (!mediaType?.startsWith('image')) {
    return { pass: true, confidence: 1.0, reason: null }
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         config.anthropic.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 256,
      system: `You are a content moderator for a travel social network.
Analyse the image and respond ONLY with valid JSON:
{
  "pass": boolean,
  "confidence": number (0.0-1.0),
  "reason": string | null,
  "categories": string[]
}

Reject (pass: false) if the image contains:
- Explicit sexual content or nudity
- Graphic violence or gore
- Hate symbols or extremist content
- Child exploitation material (IMMEDIATE rejection, confidence: 1.0)
- Spam or misleading content (fake documents, etc.)

Accept (pass: true) all legitimate travel content:
- Landscapes, cities, monuments, food, transportation
- People in non-explicit contexts (tourists, locals, etc.)
- Animals, nature, weather
- Hotel rooms, restaurants, activities`,
      messages: [
        {
          role:    'user',
          content: [
            { type: 'image', source: { type: 'url', url: mediaUrl } },
            { type: 'text',  text:   'Moderate this image for the MemoVoy travel platform.' },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    // Erro da API — aprovar provisoriamente (não bloquear conteúdo por falha técnica)
    console.warn(`[Moderation] Vision API erro ${response.status} — a aprovar provisoriamente`)
    return { pass: true, confidence: 0.5, reason: 'VISION_API_ERROR' }
  }

  const data = await response.json()
  const text = data.content?.find((b) => b.type === 'text')?.text ?? '{}'

  try {
    const result = JSON.parse(text.replace(/```json|```/g, '').trim())
    return {
      pass:       result.pass ?? true,
      confidence: result.confidence ?? 0.8,
      reason:     result.reason ?? null,
      categories: result.categories ?? [],
    }
  } catch {
    return { pass: true, confidence: 0.5, reason: 'PARSE_ERROR' }
  }
}

// ---------------------------------------------------------------------------
// Processar um item de media
// ---------------------------------------------------------------------------

async function moderateMediaItem(media) {
  // Modo auto-approve: aprovar sem verificar
  if (AUTO_APPROVE) {
    await sql`
      UPDATE post_media
      SET moderation_status = 'approved',
          moderation_detail = '{"mode":"auto_approve"}'::jsonb
      WHERE id = ${media.id}
    `
    return { id: media.id, result: 'approved', mode: 'auto' }
  }

  // Nível 1: heurísticas
  const heuristicIssues = heuristicCheck(media)
  if (heuristicIssues.length > 0) {
    const detail = JSON.stringify({ level: 1, issues: heuristicIssues })
    await rejectMedia(media, detail)
    return { id: media.id, result: 'rejected', reason: heuristicIssues[0].reason }
  }

  // Nível 2: Vision (opcional)
  let visionResult = { pass: true, confidence: 1.0, reason: null }
  if (VISION_ENABLED && media.media_type?.startsWith('image')) {
    visionResult = await visionCheck(media.url, media.media_type)
  }

  if (!visionResult.pass && visionResult.confidence >= 0.8) {
    const detail = JSON.stringify({
      level:      2,
      reason:     visionResult.reason,
      confidence: visionResult.confidence,
    })
    await rejectMedia(media, detail)
    return { id: media.id, result: 'rejected', reason: visionResult.reason }
  }

  // Aprovado
  await sql`
    UPDATE post_media
    SET moderation_status = 'approved',
        moderation_detail = ${JSON.stringify({
          level: VISION_ENABLED ? 2 : 1,
          confidence: visionResult.confidence,
        })}::jsonb
    WHERE id = ${media.id}
  `
  return { id: media.id, result: 'approved' }
}

async function rejectMedia(media, detail) {
  // Rejeitar o item de media
  await sql`
    UPDATE post_media
    SET moderation_status = 'rejected',
        moderation_detail = ${detail}::jsonb
    WHERE id = ${media.id}
  `

  // Contar quantos itens rejected tem este post
  const [counts] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE moderation_status = 'rejected') AS rejected,
      COUNT(*) AS total
    FROM post_media WHERE post_id = ${media.post_id}
  `

  // Se mais de metade da media está rejeitada, ocultar o post
  if (parseInt(counts.rejected) > parseInt(counts.total) / 2) {
    await sql`
      UPDATE posts SET is_hidden = true WHERE id = ${media.post_id}
    `

    // Notificar o utilizador
    await sql`
      INSERT INTO notifications (user_id, type, title, body, channel, status)
      SELECT
        p.user_id,
        'system',
        'Publicação ocultada',
        'Uma publicação foi ocultada por violar as nossas políticas de conteúdo.',
        'push',
        'pending'
      FROM posts p WHERE p.id = ${media.post_id}
    `

    console.log(`[Moderation] Post ${media.post_id} ocultado — media rejeitada`)
  }
}

// ---------------------------------------------------------------------------
// Ciclo principal
// ---------------------------------------------------------------------------

async function processBatch() {
  const pending = await sql`
    SELECT
      pm.id, pm.post_id, pm.url, pm.media_type,
      pm.width, pm.height, pm.thumbnail_url
    FROM post_media pm
    JOIN posts p ON p.id = pm.post_id
    WHERE pm.moderation_status = 'pending'
      AND p.deleted_at IS NULL
    ORDER BY pm.created_at ASC
    LIMIT ${BATCH_SIZE}
    FOR UPDATE OF pm SKIP LOCKED
  `

  if (pending.length === 0) return 0

  const results = await Promise.allSettled(
    pending.map((m) => moderateMediaItem(m))
  )

  let approved = 0, rejected = 0, errors = 0
  for (const r of results) {
    if (r.status === 'rejected')               errors++
    else if (r.value.result === 'approved')    approved++
    else if (r.value.result === 'rejected')    rejected++
  }

  if (approved + rejected + errors > 0) {
    console.log(`[Moderation] Lote: ${approved} aprovados, ${rejected} rejeitados, ${errors} erros`)
  }

  return approved + rejected + errors
}

// ---------------------------------------------------------------------------
// Loop principal
// ---------------------------------------------------------------------------

async function run() {
  console.log('[Moderation] Worker iniciado')

  let idleCount = 0
  while (true) {
    try {
      const processed = await processBatch()
      if (processed === 0) {
        idleCount++
        const delay = Math.min(POLL_INTERVAL * Math.pow(1.5, Math.min(idleCount, 4)), 60_000)
        await sleep(delay)
      } else {
        idleCount = 0
        await sleep(500)
      }
    } catch (err) {
      console.error('[Moderation] Erro no ciclo:', err.message)
      await sleep(POLL_INTERVAL)
    }
  }
}

process.on('SIGTERM', async () => { await sql.end(); process.exit(0) })
process.on('SIGINT',  async () => { await sql.end(); process.exit(0) })

run().catch((err) => { console.error('[Moderation] Fatal:', err); process.exit(1) })

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }
