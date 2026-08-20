import { z } from 'zod'
import { query } from '../db/pool.js'
import { logAudit } from '../services/audit.js'

/**
 * Moderation queue.
 *
 * POST /reports has existed for a long time and wrote to content_reports, but
 * nothing ever read that table: no endpoint listed it, no page showed it, and
 * `is_admin` was checked in exactly one place in the whole codebase — the
 * socket handshake, to join `admin:alerts`, a room with no listener on the
 * client. A user reporting abusive content had that report land in the database
 * and stay there forever.
 *
 * Every route here goes through requireAdmin, which reads the flag from the
 * database rather than the token, and answers 404 instead of 403 so probing
 * does not confirm the area exists.
 */

/** Tables the report target lives in, keyed by target_type. */
const TABELA_DO_ALVO = {
  post:      'posts',
  comment:   'post_comments',
  itinerary: 'itineraries',
  user:      'users',
}

export async function adminRoutes(app) {
  // ─── GET /admin/reports ─────────────────────────────────────────────────
  app.get('/reports', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const params = z.object({
      status: z.enum(['pending', 'resolved']).default('pending'),
      limit:  z.coerce.number().int().min(1).max(100).default(50),
    }).safeParse(request.query)

    if (!params.success) {
      return reply.status(400).send({ message: params.error.errors[0].message })
    }

    const { status, limit } = params.data

    // Agrupado por alvo: dez pessoas a denunciar a mesma publicação são um caso
    // a decidir, não dez. A contagem é o sinal mais forte que a fila tem.
    const { rows } = await query(
      `SELECT
         r.target_type,
         r.target_id,
         COUNT(*)::int                      AS total,
         MIN(r.created_at)                  AS primeira,
         MAX(r.created_at)                  AS ultima,
         ARRAY_AGG(DISTINCT r.reason)       AS motivos,
         MAX(r.ai_severity)                 AS ai_severity,
         MAX(r.ai_action)                   AS ai_action,
         MAX(r.ai_reasoning)                AS ai_reasoning,
         ARRAY_AGG(DISTINCT u.username)     AS denunciantes
       FROM content_reports r
       JOIN users u ON u.id = r.reporter_id
       WHERE r.status = $1
       GROUP BY r.target_type, r.target_id
       ORDER BY
         CASE MAX(r.ai_severity)
           WHEN 'critical' THEN 0 WHEN 'high' THEN 1
           WHEN 'medium'   THEN 2 WHEN 'low'  THEN 3
           ELSE 4
         END,
         COUNT(*) DESC,
         MIN(r.created_at) ASC
       LIMIT $2`,
      [status, limit],
    )

    // Um excerto do conteúdo denunciado, para se poder decidir sem sair da
    // página. Uma query por tipo presente, não uma por linha.
    const porTipo = {}
    for (const r of rows) (porTipo[r.target_type] ??= []).push(r.target_id)

    const excertos = {}
    for (const [tipo, ids] of Object.entries(porTipo)) {
      const sql = {
        post:      'SELECT id, LEFT(caption, 200) AS excerto, user_id FROM posts WHERE id = ANY($1)',
        comment:   'SELECT id, LEFT(content, 200) AS excerto, user_id FROM post_comments WHERE id = ANY($1)',
        itinerary: 'SELECT id, LEFT(title, 200)   AS excerto, user_id FROM itineraries WHERE id = ANY($1)',
        user:      'SELECT id, username           AS excerto, id AS user_id FROM users WHERE id = ANY($1)',
      }[tipo]

      const { rows: encontrados } = await query(sql, [ids])
      for (const e of encontrados) excertos[`${tipo}:${e.id}`] = e
    }

    return reply.send({
      reports: rows.map((r) => {
        const alvo = excertos[`${r.target_type}:${r.target_id}`]
        return {
          targetType:   r.target_type,
          targetId:     r.target_id,
          total:        r.total,
          motivos:      r.motivos,
          denunciantes: r.denunciantes,
          primeira:     r.primeira,
          ultima:       r.ultima,
          aiSeverity:   r.ai_severity,
          aiAction:     r.ai_action,
          aiReasoning:  r.ai_reasoning,
          // Ausente quando o conteúdo já desapareceu por outra via.
          excerto:      alvo?.excerto ?? null,
          autorId:      alvo?.user_id ?? null,
          existe:       Boolean(alvo),
        }
      }),
    })
  })

  // ─── GET /admin/reports/stats ───────────────────────────────────────────
  app.get('/reports/stats', { preHandler: [app.requireAdmin] }, async (_request, reply) => {
    const { rows } = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending')::int  AS pendentes,
         COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolvidas,
         COUNT(*) FILTER (WHERE status = 'pending' AND ai_severity = 'critical')::int AS criticas
       FROM content_reports`,
    )
    return reply.send(rows[0])
  })

  // ─── POST /admin/reports/resolve ────────────────────────────────────────
  app.post('/reports/resolve', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const parsed = z.object({
      targetType: z.enum(['post', 'comment', 'itinerary', 'user']),
      targetId:   z.string().uuid(),
      resolution: z.enum(['dismissed', 'removed']),
      note:       z.string().max(500).optional(),
    }).safeParse(request.body)

    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.errors[0].message })
    }

    const { targetType, targetId, resolution, note } = parsed.data

    // Contas não se apagam a partir daqui. Suspender ou eliminar alguém é um
    // acto de outra natureza, com implicações de RGPD e sem retorno; uma fila
    // de denúncias não é o sítio para o fazer com um clique.
    if (targetType === 'user' && resolution === 'removed') {
      return reply.status(400).send({
        message: 'Denúncias sobre contas só podem ser arquivadas aqui. A acção sobre a conta é tratada à parte.',
      })
    }

    const { rows: pendentes } = await query(
      `SELECT id FROM content_reports
       WHERE target_type = $1 AND target_id = $2 AND status = 'pending'`,
      [targetType, targetId],
    )
    if (pendentes.length === 0) {
      return reply.status(404).send({ message: 'Não há denúncias pendentes sobre isto.' })
    }

    if (resolution === 'removed') {
      if (targetType === 'itinerary') {
        // Despublicar, não destruir: um roteiro é trabalho de alguém, e sair da
        // vista pública resolve o problema sem apagar a viagem do autor.
        await query('UPDATE itineraries SET is_public = FALSE WHERE id = $1', [targetId])
      } else {
        await query(`DELETE FROM ${TABELA_DO_ALVO[targetType]} WHERE id = $1`, [targetId])
      }
    }

    // Todas as denúncias sobre o mesmo alvo se resolvem juntas — a decisão é
    // sobre o conteúdo, não sobre cada queixa isolada.
    const { rowCount } = await query(
      `UPDATE content_reports
       SET status = 'resolved', resolution = $1, resolved_by = $2,
           resolved_at = NOW(), resolver_note = $3
       WHERE target_type = $4 AND target_id = $5 AND status = 'pending'`,
      [resolution, request.user.id, note ?? null, targetType, targetId],
    )

    await logAudit(request.user.id, 'moderation_resolve', {
      targetType, targetId, resolution, reports: rowCount,
    }, request.ip)

    return reply.send({ ok: true, resolvidas: rowCount, resolution })
  })
}
